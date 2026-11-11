import test from "node:test";
import assert from "node:assert/strict";
import { Type } from "typebox";
import { make, command, tool, until, hold, sleep, sdkVersion } from "./support/sdk.mjs";

test(
  "SDK 1.x: command fixture waits for a prompt deferred during settled handlers",
  { skip: !sdkVersion.startsWith("1.") },
  async () => {
    const gate = hold();
    let entered = false,
      completed = false,
      first = true;
    const host = await make("deferred-prompt", {
      extra: (pi) =>
        pi.on("agent_settled", async () => {
          if (!first) return;
          first = false;
          entered = true;
          await gate.promise;
        }),
    });
    let initial, followup;
    try {
      initial = command(host, "first turn");
      await until(
        () => entered && host.session.isIdle,
        "settled handler held while SDK reports idle",
      );
      followup = command(host, "deferred genuine user turn").then(() => {
        completed = true;
      });
      await sleep(30);
      assert.equal(completed, false, "command must not return before its deferred prompt starts");
      assert.equal(host.calls.length, 1);
      gate.release();
      await Promise.all([initial, followup]);
      assert.equal(host.calls.length, 2);
      assert.equal(host.session.isIdle, true);
    } finally {
      gate.release();
      await initial;
      await followup;
      await host.close();
    }
  },
);

// Real SDK lifecycle and IPC, inert pi-subagents-shaped tool. This tests the
// public adapter contract, not a real worker/model or pi-subagents' scheduler.
test("SDK: scoped subagent launch/resume ownership survives completion and reload as denial evidence", async () => {
  let executions = 0;
  const worker = await make("native-worker");
  const host = await make("native-host", {
    tools: ["peer_goal", "subagent"],
    extra: (pi) =>
      pi.registerTool({
        name: "subagent",
        label: "Inert Subagent",
        description: "Contract fixture; no child or network",
        parameters: Type.Object({
          agent: Type.Optional(Type.String()),
          task: Type.Optional(Type.String()),
          action: Type.Optional(Type.String()),
          id: Type.Optional(Type.String()),
          message: Type.Optional(Type.String()),
        }),
        async execute() {
          executions++;
          return {
            content: [{ type: "text", text: "fixture completed" }],
            details: {
              mode: "single",
              runId: `native-${executions}`,
              asyncId: `native-${executions}`,
              results: [],
            },
          };
        },
      }),
  });
  const lastGoalResult = () =>
    host.session.agent.state.messages
      .filter((m) => m.role === "toolResult" && m.toolName === "peer_goal")
      .at(-1);
  const peerCall = async (goalId, input, text) => {
    const calls = host.calls.length;
    host.setToolCall({ name: "subagent", arguments: input });
    await tool(worker, "send_pi_message").execute("send-fixture", {
      target: host.peer.instanceId,
      message: text,
      goalId,
    });
    await until(() => host.calls.length === calls + 2 && host.session.isIdle);
    return host.session.agent.state.messages
      .filter((m) => m.role === "toolResult" && m.toolName === "subagent")
      .at(-1);
  };
  try {
    host.session.setActiveToolsByName(["peer_goal", "subagent"]);
    host.setToolCall({
      name: "peer_goal",
      arguments: { action: "start", objective: "Repair and verify the original task" },
    });
    await command(host, "Authorize peer collaboration");
    const goalId = lastGoalResult().details.goalId;
    host.setToolCall({
      name: "peer_goal",
      arguments: { action: "bind", goalId, peerIds: [worker.peer.instanceId] },
    });
    await command(host, "Bind the worker");
    assert.equal(
      (await peerCall(goalId, { agent: "worker", task: "repair" }, "launch")).isError,
      false,
    );
    assert.equal(
      (await peerCall(goalId, { action: "resume", id: "native-1", message: "verify" }, "resume"))
        .isError,
      false,
    );
    assert.equal(
      (
        await peerCall(
          goalId,
          { action: "steer", id: "foreign", message: "outside goal" },
          "refuse foreign",
        )
      ).isError,
      true,
    );
    assert.equal(executions, 2);
    host.setToolCall({ name: "peer_goal", arguments: { action: "complete", goalId } });
    await command(host, "Goal verified complete");
    await host.session.reload();
    host.session.setActiveToolsByName(["peer_goal", "subagent"]);
    const before = host.calls.length;
    host.setToolCall({ name: "subagent", arguments: { agent: "worker", task: "must not revive" } });
    await host.session.sendCustomMessage(
      {
        customType: "subagent-notify",
        content: "Late completion",
        display: true,
        details: { runs: [{ id: "native-2", runId: "native-2", source: "async" }] },
      },
      { triggerTurn: true },
    );
    await until(() => host.calls.length === before + 2 && host.session.isIdle);
    assert.equal(executions, 2);
    assert.equal(
      host.session.agent.state.messages
        .filter((m) => m.role === "toolResult" && m.toolName === "subagent")
        .at(-1).isError,
      true,
    );
    assert.deepEqual(host.errors, []);
  } finally {
    await host.close();
    await worker.close();
  }
});
