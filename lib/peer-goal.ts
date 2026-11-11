import { randomUUID } from "node:crypto";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { validId } from "./contract";
import { allowsSubagent, subagentNotificationIds, subagentRunIds } from "./subagents";

export const GOAL_ENTRY = "cross-session:goal-ownership:v1";
type Scope = { sessionId: string; instanceId: string; cwd: string };
type TaskKind = "mesh" | "agent" | "subagent";
type Ownership = {
  goalId: string;
  callId?: string;
  tool?: string;
  runs?: string[];
  agents?: string[];
  subagentRuns?: string[];
};
export type PeerGoal = {
  id: string;
  objective: string;
  scope: Scope;
  active: boolean;
  peers: Map<string, string>;
};

function resultIds(tool: string, details: unknown): Partial<Record<TaskKind, string[]>> {
  const result = details as { run?: { id?: unknown }; agentId?: unknown } | undefined;
  if (tool === "mesh" && validId(result?.run?.id)) return { mesh: [result.run.id] };
  if (tool === "Agent" && validId(result?.agentId)) return { agent: [result.agentId] };
  if (tool === "subagent") return { subagent: subagentRunIds(details) };
  return {};
}

export class PeerGoals {
  current?: PeerGoal;

  constructor(
    private readonly entries: () => SessionEntry[],
    private readonly append: (data: Ownership) => void,
  ) {}

  start(objective: string, scope: Scope): PeerGoal {
    if (this.current)
      throw new Error("Complete or cancel the current peer goal before starting another");
    return (this.current = {
      id: randomUUID(),
      objective,
      scope: { ...scope },
      active: true,
      peers: new Map(),
    });
  }

  valid(goal: PeerGoal | undefined, scope: Scope): goal is PeerGoal {
    return (
      !!goal &&
      goal === this.current &&
      goal.active &&
      goal.scope.sessionId === scope.sessionId &&
      goal.scope.instanceId === scope.instanceId &&
      goal.scope.cwd === scope.cwd
    );
  }

  match(
    details: { goalId?: string; from: { id: string; instanceId: string } },
    scope: Scope,
  ): PeerGoal | undefined {
    const goal = this.current;
    return this.valid(goal, scope) &&
      goal.id === details.goalId &&
      goal.peers.get(details.from.instanceId) === details.from.id
      ? goal
      : undefined;
  }

  end(): void {
    if (this.current) this.current.active = false;
    this.current = undefined;
  }

  reset(): void {
    this.end();
  } // Revocation never erases task ownership evidence.

  private ownership(entry: SessionEntry): Ownership | undefined {
    if (entry.type !== "custom" || entry.customType !== GOAL_ENTRY) return;
    const data = entry.data as Ownership | undefined;
    return validId(data?.goalId) ? data : undefined;
  }

  private call(callId: string, tool: string): Ownership | undefined {
    for (const entry of this.entries()) {
      const data = this.ownership(entry);
      if (data?.callId === callId && data.tool === tool) return data;
    }
  }

  note(goal: PeerGoal, tool: string, callId: string): void {
    // Persist before execution so even late results retain their revoked owner.
    this.append({ goalId: goal.id, tool, callId });
  }

  owner(kind: TaskKind, id: unknown): string | undefined {
    if (!validId(id)) return;
    const field = { mesh: "runs", agent: "agents", subagent: "subagentRuns" } as const;
    // A single journal scan; do not retain an unbounded cache or forget revoked
    // owners through LRU eviction. Calls always precede their results.
    const calls = new Map<string, Ownership>();
    for (const entry of this.entries()) {
      const data = this.ownership(entry);
      if (data?.[field[kind]]?.includes(id)) return data.goalId;
      if (data?.callId && data.tool) calls.set(JSON.stringify([data.tool, data.callId]), data);
      if (entry.type !== "message" || entry.message.role !== "toolResult") continue;
      const message = entry.message;
      if (resultIds(message.toolName, message.details)[kind]?.includes(id)) {
        const call = calls.get(JSON.stringify([message.toolName, message.toolCallId]));
        if (call) return call.goalId;
      }
    }
  }

  bindTasks(
    goalId: string,
    runs: string[] = [],
    agents: string[] = [],
    subagentRuns: string[] = [],
  ): void {
    for (const [kind, ids] of [
      ["mesh", runs],
      ["agent", agents],
      ["subagent", subagentRuns],
    ] as const) {
      for (const id of ids) {
        const previous = this.owner(kind, id);
        if (previous && previous !== goalId)
          throw new Error("Task is already bound to a different goal");
      }
    }
    if (runs.length || agents.length || subagentRuns.length)
      this.append({ goalId, runs, agents, subagentRuns });
  }

  record(callId: string, tool: string, details: unknown): void {
    const call = this.call(callId, tool);
    if (!call) return;
    // Error receipts can still contain launched tasks (e.g. metadata persistence
    // failed after launch). Ownership is negative evidence, never a renewed grant.
    const ids = resultIds(tool, details);
    this.bindTasks(call.goalId, ids.mesh, ids.agent, ids.subagent);
  }

  notifications(details: unknown): string[] {
    const goals = new Set<string>();
    const ids = (details as { ids?: unknown } | undefined)?.ids;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id !== "string") continue;
        const parts = id.split(":");
        const owner = this.owner(
          parts[0] === "mesh" ? "mesh" : "agent",
          parts[0] === "mesh" ? parts[1] : parts[0],
        );
        if (owner) goals.add(owner);
      }
    }
    for (const id of subagentNotificationIds(details)) {
      const owner = this.owner("subagent", id);
      if (owner) goals.add(owner);
    }
    return [...goals];
  }

  allows(goal: PeerGoal, tool: string, input: Record<string, unknown>): boolean {
    if (!goal.active) return false;
    if (tool === "subagents_enable") return true;
    if (tool === "subagent")
      return allowsSubagent(input, (id) => this.owner("subagent", id) === goal.id);
    if (tool === "Agent")
      return !input.schedule && (!input.resume || this.owner("agent", input.resume) === goal.id);
    if (tool === "steer_subagent" || tool === "send_subagent")
      return this.owner("agent", input.agent_id) === goal.id;
    if (tool !== "mesh") return false;
    if (input.action === "run") return true;
    return (
      [
        "continue",
        "resume",
        "retry_failed",
        "steer",
        "cancel",
        "pause",
        "message_send",
        "message_broadcast",
        "growth_decide",
      ].includes(String(input.action)) && this.owner("mesh", input.runId) === goal.id
    );
  }
}
