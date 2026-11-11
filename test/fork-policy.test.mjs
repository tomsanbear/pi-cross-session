import test from "node:test";
import assert from "node:assert/strict";
import { component, wire, message, info } from "./support/component.mjs";
import { registrations } from "./support/sdk.mjs";

for (const value of ["0", "29", "3601", "NaN", "600junk", "600.5", ""]) {
  test(`invalid queue retention ${JSON.stringify(value)} fails closed before registration`, async () => {
    const host = await component("invalid-ttl", { queueTtlSeconds: value });
    try {
      assert.equal(host.peer, undefined);
      assert.ok(host.notices.some((row) => row[0].includes("30 through 3600")));
    } finally {
      await host.close();
    }
  });
}

for (const outcome of ["error", "length", "aborted", "toolUse"]) {
  test(`auto-resume never reopens after user terminal ${outcome}`, async () => {
    const host = await component("unsafe-resume", { rpc: true });
    try {
      host.runtime.flagValues.set("cross-session-auto-resume", true);
      await host.busy();
      host.controller.abort();
      await host.settled(false);
      await host.busy();
      await host.emit("message_end", { message: { role: "assistant", stopReason: outcome } });
      await host.settled(false);
      assert.equal(info(host).stopped, true);
    } finally {
      await host.close();
    }
  });
}

test("budget command is explicit, bounded and does not reopen reception", async () => {
  const host = await component("budget-command", { rpc: true });
  try {
    await host.busy();
    await host.command("cross-session-budget", "1000");
    assert.equal(info(host).remainingBudget, 256, "busy commands cannot change allowance");
    host.controller.abort();
    await host.settled(false);
    for (const invalid of ["", "-1", "0", "4097", "1junk"]) {
      await host.command("cross-session-budget", invalid);
      assert.equal(info(host).remainingBudget, 256);
    }
    await host.command("cross-session-budget", "1000");
    assert.equal(info(host).remainingBudget, 1000);
    assert.equal(info(host).stopped, true);
  } finally {
    await host.close();
  }
});

test("explicit legacy opt-out cannot turn a completed scoped peer turn into unrestricted authority", async () => {
  const sender = await component("legacy-worker"),
    host = await component("legacy-goal", { guard: false });
  try {
    await host.busy();
    const { goalId } = (
      await host.tool("peer_goal", { action: "start", objective: "Original task" })
    ).details;
    await host.tool("peer_goal", { action: "bind", goalId, peerIds: [sender.peer.instanceId] });
    await host.settled();
    await wire(sender, host, message("complete goal", { goalId }));
    await host.tool("peer_goal", { action: "complete", goalId });
    for (const toolName of ["subagent", "subagents_enable", "Agent", "set_config"]) {
      assert.equal((await host.emit("tool_call", { toolName, input: {} }))?.block, true, toolName);
    }
  } finally {
    await host.close();
    await sender.close();
  }
});

test("pi-subagents child identity is captured per extension, not applied to other same-PID Hosts", async () => {
  const previous = process.env.PI_SUBAGENT_CHILD;
  let child, host;
  try {
    process.env.PI_SUBAGENT_CHILD = "1";
    child = await component("native-child");
    assert.equal(child.peer, undefined);
    delete process.env.PI_SUBAGENT_CHILD;
    host = await component("same-pid-host");
    assert.ok(host.peer);
    await child.emit("session_start");
    assert.equal(registrations().length, 1);
    process.env.PI_SUBAGENT_CHILD = "1";
    await host.emit("session_start");
    assert.equal(registrations().length, 1, "Host identity does not follow transient process env");
    assert.equal(await child.emit("tool_call", { toolName: "subagent", input: {} }), undefined);
  } finally {
    if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previous;
    await host?.close();
    await child?.close();
  }
});

test("receipt queries cannot see another sender, recover by display name, or cause resubmission", async () => {
  const a = await component("receipt-owner"),
    c = await component("receipt-stranger"),
    b = await component("receipt-host");
  try {
    const sent = await a.tool("send_pi_message", {
      target: b.peer.instanceId,
      message: "one message",
    });
    const query = { target: b.peer.instanceId, messageId: sent.details.messageId };
    assert.equal((await c.tool("get_pi_message_status", query)).details.status, "unknown");
    await assert.rejects(
      a.tool("get_pi_message_status", { ...query, target: b.peer.name }),
      /invalid_request/,
    );
    assert.equal(b.calls.length, 1);
  } finally {
    await b.close();
    await c.close();
    await a.close();
  }
});
