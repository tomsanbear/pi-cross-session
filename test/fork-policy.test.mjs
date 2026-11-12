import test from "node:test";
import assert from "node:assert/strict";
import { component, wire, message, info } from "./support/component.mjs";
import { RPC_SEND } from "../lib/contract.ts";

test("explicit inbound refusal remains an operator choice", async () => {
  const a = await component("refuse-sender"),
    b = await component("refuse-host", { inbound: "refuse" });
  try {
    assert.equal((await wire(a, b, message("declined"))).status, "refused");
    assert.equal(b.calls.length, 0);
    b.runtime.flagValues.set("cross-session-inbound", "invalid");
    assert.equal((await wire(a, b, message("invalid setting"))).status, "refused");
    b.runtime.flagValues.set("cross-session-inbound", "accept");
    assert.equal((await wire(a, b, message("now open"))).status, "submitted");
  } finally {
    await b.close();
    await a.close();
  }
});

test("every loaded session registers, including managed runtimes and same-PID children", async () => {
  const previous = process.env.PI_SUBAGENT_CHILD;
  let child, host;
  try {
    process.env.PI_SUBAGENT_CHILD = "1";
    child = await component("native-child", { managed: true });
    delete process.env.PI_SUBAGENT_CHILD;
    host = await component("parent-host");
    assert.ok(child.peer);
    assert.ok(host.peer);
    assert.notEqual(child.peer.instanceId, host.peer.instanceId);
    assert.equal((await wire(child, host, message("child finding"))).status, "submitted");
    assert.equal((await wire(host, child, message("parent reply"))).status, "submitted");
  } finally {
    if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previous;
    await host?.close();
    await child?.close();
  }
});

test("RPC bounds simultaneous requests, not the lifetime of the inbox", async () => {
  const a = await component("rpc-cap-a", { rpc: true }),
    b = await component("rpc-cap-b");
  try {
    const replies = [];
    for (let index = 0; index < 33; index++) {
      const requestId = `request-${index}`;
      a.bus.on(`${RPC_SEND}:reply:${requestId}`, (reply) => replies.push(reply));
      const request = {
        version: 1,
        requestId,
        local: info(a).local,
        remoteInstanceId: b.peer.instanceId,
        messageId: `message-${index}`,
        text: `test ${index}`,
      };
      a.bus.emit(RPC_SEND, request);
      if (index === 0) a.bus.emit(RPC_SEND, request);
    }
    assert.equal(info(a).rpcInFlight, 32);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].code, "busy");
    await a.emit("session_shutdown");
    assert.equal(replies.length, 33);
    assert.equal(new Set(replies.map((reply) => reply.requestId)).size, 33);
    assert.equal(b.calls.length, 0);
  } finally {
    await b.close();
    await a.close();
  }
});

test("legacy goal metadata cannot pretend to be a supported authorization contract", async () => {
  const a = await component("legacy-goal-a"),
    b = await component("legacy-goal-b");
  try {
    assert.equal(
      (await wire(a, b, message("old grant", { goalId: "obsolete-goal" }))).status,
      "unsupported",
    );
    assert.equal(b.calls.length, 0);
    assert.equal((await wire(a, b, message("ordinary coordination"))).status, "submitted");
  } finally {
    await b.close();
    await a.close();
  }
});
