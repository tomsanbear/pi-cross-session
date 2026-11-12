import test from "node:test";
import assert from "node:assert/strict";
import { component, wire, message, info } from "./support/component.mjs";
import { until } from "./support/sdk.mjs";
import { requestRpc, RPC_SEND, RECEIVED } from "../lib/contract.ts";

async function fixtures(fn) {
  const a = await component("live-sender", { rpc: true });
  const b = await component("live-receiver", { rpc: true });
  try {
    await fn(a, b);
  } finally {
    await b.close();
    await a.close();
  }
}

for (const outcome of ["aborted", "error", "length", "toolUse", "unknown"]) {
  test(`queued messages survive ${outcome} and drain in order without a user turn`, async () =>
    fixtures(async (a, b) => {
      await b.busy();
      assert.equal((await wire(a, b, message("first"))).status, "queued");
      assert.equal((await wire(a, b, message("second"))).status, "queued");
      if (outcome === "aborted") b.controller.abort();
      if (outcome !== "unknown")
        await b.emit("message_end", { message: { role: "assistant", stopReason: outcome } });
      await b.settled(false);
      await until(() => b.calls.length === 1);
      assert.equal(b.calls[0].message.details.text, "first");
      await b.busy("extension");
      await b.settled(false);
      await until(() => b.calls.length === 2);
      assert.equal(b.calls[1].message.details.text, "second");
      assert.ok(info(b).states.every((row) => row.state === "submitted"));
      assert.match(b.calls[0].message.content, /another agent session, not the user/);
      assert.equal(b.calls[0].opts.deliverAs, "followUp");
    }));
}

test("no task/goal gates, resume commands, safety switches or lifetime allowance remain", async () =>
  fixtures(async (a, b) => {
    assert.equal(b.ext.tools.has("peer_goal"), false);
    assert.equal(b.ext.handlers.has("tool_call"), false);
    assert.equal(b.ext.handlers.has("tool_result"), false);
    for (const command of ["cross-session-resume", "cross-session-budget"])
      assert.equal(b.ext.commands.has(command), false);
    for (const flag of [
      "cross-session-guard",
      "cross-session-auto-resume",
      "cross-session-unsafe-peer-tools",
      "cross-session-queue-ttl-seconds",
    ])
      assert.equal(b.ext.flags.has(flag), false);
    await wire(a, b, message("coordinate normally"));
    for (const toolName of ["subagent", "subagents_enable", "Agent", "mesh", "set_config"]) {
      assert.equal(await b.emit("tool_call", { toolName, input: { action: "run" } }), undefined);
    }
    assert.equal(info(b).remainingBudget, undefined);
  }));

test("admitted messages do not expire while the session stays open", async (t) =>
  fixtures(async (a, b) => {
    await b.busy();
    let clock = Date.now();
    t.mock.method(Date, "now", () => clock);
    const sent = await wire(a, b, message("important finding"));
    assert.equal(sent.status, "queued");
    assert.equal(sent.expiresAt, undefined);
    clock += 24 * 60 * 60 * 1000;
    await b.settled(false);
    await until(() => b.calls.length === 1);
    assert.equal(b.calls[0].message.details.text, "important finding");
  }));

test(
  "ordinary messages and RPC sends continue beyond their old lifetime quotas",
  { timeout: 20000 },
  async (t) =>
    fixtures(async (a, b) => {
      let clock = Date.now();
      t.mock.method(Date, "now", () => clock);
      b.bus.on(RECEIVED, (event) => event.reply({ handled: true }));
      for (let index = 0; index < 540; index++) {
        clock += 2100;
        const reply = await requestRpc(a.bus, RPC_SEND, {
          version: 1,
          requestId: `rpc-${index}`,
          local: { sessionId: a.peer.id, instanceId: a.peer.instanceId },
          remoteInstanceId: b.peer.instanceId,
          messageId: `message-${index}`,
          text: `finding ${index}`,
        });
        assert.equal(reply.ok, true, `RPC ${index}`);
        assert.equal(reply.receipt.status, "accepted");
      }
      assert.equal(b.calls.length, 0);
      assert.ok(info(b).states.length <= 512);
    }),
);

test("temporarily unavailable SDK state retains mail and recovers without reopening", async () =>
  fixtures(async (a, b) => {
    const idle = b.ctx.isIdle;
    b.ctx.isIdle = () => {
      throw Error("temporary SDK state failure");
    };
    assert.equal((await wire(a, b, message("retain through SDK state failure"))).status, "queued");
    assert.equal(b.calls.length, 0);
    assert.match(info(b).sdkStateError, /temporary SDK state failure/);
    b.ctx.isIdle = idle;
    await until(() => b.calls.length === 1);
    assert.equal(info(b).sdkStateError, null);
  }));

test("busy preflight without a live signal queues rather than refusing correspondence", async () =>
  fixtures(async (a, b) => {
    b.setIdle(false);
    await b.emit("before_agent_start");
    assert.equal((await wire(a, b, message("during preflight"))).status, "queued");
    b.setIdle(true);
    await b.emit("agent_settled");
    await until(() => b.calls.length === 1);
  }));
