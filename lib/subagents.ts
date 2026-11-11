import { validId } from "./contract";

// pi-subagents' public tool contract, not its private runtime internals.
// Unknown actions/options fail closed until their authority is reviewed.
const launchKeys = new Set([
  "agent", "task", "async", "model", "cwd", "worktree", "output", "context",
  "timeoutMs", "maxRuntimeMs", "toolTimeoutMs", "checkpointBeforeDeadlineMs",
  "maxOutput", "outputMode", "artifacts", "includeProgress", "baseRef", "isolation",
]);
const controlKeys = new Set(["action", "id", "runId", "message", "index", "childId", "mode", "toolCallId"]);
const controlActions = new Set(["resume", "steer", "interrupt", "stop", "command.cancel", "command.yield"]);
const readActions = new Set(["status", "list", "get", "models", "guide", "children.list", "command.status"]);

type Input = Record<string, unknown>;
export function subagentInput(input: Input): Input | undefined {
  const { options, ...flat } = input;
  if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) return;
  for (const [key, value] of Object.entries(options ?? {})) {
    if (key === "options" || key === "__proto__" || key === "constructor" || key === "prototype") return;
    if (key in flat && JSON.stringify(flat[key]) !== JSON.stringify(value)) return;
    flat[key] = value;
  }
  if (flat.id !== undefined && flat.runId !== undefined && flat.id !== flat.runId) return;
  if (typeof flat.action === "string") flat.action = flat.action.trim();
  return flat;
}

export function subagentReadOnly(input: Input): boolean {
  const normalized = subagentInput(input);
  return !!normalized && readActions.has(String(normalized.action));
}

export function subagentCreatesTask(input: Input): boolean {
  const normalized = subagentInput(input);
  return !!normalized && (!normalized.action || normalized.action === "resume");
}

export function allowsSubagent(input: Input, owns: (id: string) => boolean): boolean {
  const normalized = subagentInput(input);
  if (!normalized) return false;
  if (!normalized.action) {
    // Raw/named workflows can resume arbitrary runs internally without another
    // observable tool_call. They require local user authority, not a peer grant.
    return Object.keys(normalized).every(key => launchKeys.has(key)) &&
      typeof normalized.agent === "string" && !!normalized.agent.trim() &&
      typeof normalized.task === "string" && !!normalized.task.trim();
  }
  if (readActions.has(String(normalized.action))) return true;
  const id = normalized.id ?? normalized.runId;
  return controlActions.has(String(normalized.action)) &&
    Object.keys(normalized).every(key => controlKeys.has(key)) && validId(id) && owns(id);
}

export function subagentRunIds(details: unknown): string[] {
  if (!details || typeof details !== "object") return [];
  const result = details as { runId?: unknown; asyncId?: unknown };
  return [...new Set([result.runId, result.asyncId].filter(validId))];
}

export function subagentNotificationIds(details: unknown): string[] {
  const runs = (details as { runs?: unknown } | undefined)?.runs;
  if (!Array.isArray(runs)) return [];
  return runs.flatMap(run => {
    if (!run || typeof run !== "object") return [];
    return [run.id, run.runId].filter(validId);
  });
}
