import test from "node:test";
import assert from "node:assert/strict";
import { Type } from "typebox";
import { make, command, send, until, hold, sleep, sdkVersion } from "./support/sdk.mjs";

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
      assert.equal(completed, false);
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

for (const toolName of ["subagent", "subagents_enable", "Agent", "mesh", "set_config"]) {
  test(`real SDK: peer turns do not encounter a Cross tool gate for ${toolName}`, async () => {
    let executions = 0;
    const a = await make(`ungated-${toolName}-a`),
      b = await make(`ungated-${toolName}-b`, {
        tools: [toolName],
        extra: (pi) =>
          pi.registerTool({
            name: toolName,
            label: "Inert fixture",
            description: "No child, configuration mutation or network",
            parameters: Type.Object({}),
            async execute() {
              executions++;
              return { content: [{ type: "text", text: "fixture executed" }], details: {} };
            },
          }),
      });
    try {
      b.session.setActiveToolsByName([toolName]);
      b.setToolCall({ name: toolName, arguments: {} });
      await send(a, b, "coordination finding");
      await until(() => b.calls.length === 2 && b.session.isIdle);
      assert.equal(executions, 1);
      assert.equal(
        b.session.agent.state.messages.find(
          (m) => m.role === "toolResult" && m.toolName === toolName,
        ).isError,
        false,
      );
      assert.match(JSON.stringify(b.calls[0].messages), /another agent session, not the user/);
      assert.deepEqual(b.errors, []);
    } finally {
      await b.close();
      await a.close();
    }
  });
}

test("real SDK: the host's independent permission extension remains authoritative", async () => {
  let executions = 0;
  const a = await make("permission-a"),
    b = await make("permission-b", {
      tools: ["subagent"],
      extra: (pi) => {
        pi.registerTool({
          name: "subagent",
          label: "Inert fixture",
          description: "No real worker",
          parameters: Type.Object({}),
          async execute() {
            executions++;
            return { content: [], details: {} };
          },
        });
        pi.on("tool_call", (event) =>
          event.toolName === "subagent"
            ? { block: true, reason: "Independent host permission policy" }
            : undefined,
        );
      },
    });
  try {
    b.session.setActiveToolsByName(["subagent"]);
    b.setToolCall({ name: "subagent", arguments: {} });
    await send(a, b, "a peer is not permission approval");
    await until(() => b.calls.length === 2 && b.session.isIdle);
    assert.equal(executions, 0);
    const result = b.session.agent.state.messages.find(
      (m) => m.role === "toolResult" && m.toolName === "subagent",
    );
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /Independent host permission policy/);
  } finally {
    await b.close();
    await a.close();
  }
});
