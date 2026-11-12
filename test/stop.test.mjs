import test from "node:test";
import assert from "node:assert/strict";
import { make, send, hold, until, sleep, hasPeer, command, sdkVersion } from "./support/sdk.mjs";

for (const scenario of ["normal-release", "abort-release"]) {
  test(
    `real SDK ${sdkVersion}: ${scenario} preserves queued correspondence`,
    { timeout: 15000 },
    async () => {
      const a = await make(`sender-${scenario}`),
        b = await make(`receiver-${scenario}`);
      const gate = hold();
      b.setGate(gate);
      let prompt;
      try {
        prompt = command(b, `USER_BUSY_${scenario}`);
        await until(() => b.calls.length === 1);
        const text = `PEER_${scenario}`;
        assert.equal((await send(a, b, text)).details.status, "queued");
        await sleep(40);
        assert.equal(b.calls.length, 1);
        assert.equal(hasPeer(b, text), false);
        assert.equal(
          b.session.agent.hasQueuedMessages(),
          false,
          "busy messages remain in the extension inbox",
        );
        if (scenario === "abort-release") await b.session.abort();
        gate.release();
        await prompt;
        await until(() => b.calls.length === 2 && b.session.isIdle);
        assert.equal(b.calls[0].aborted, scenario === "abort-release");
        assert.equal(b.calls[1].completed, true);
        assert.equal(
          b.session.agent.state.messages.filter(
            (m) => m.role === "custom" && m.details?.text === text,
          ).length,
          1,
        );
        assert.match(JSON.stringify(b.calls[1].messages), /another agent session, not the user/);
        await sleep(40);
        assert.equal(b.calls.length, 2, "no replay or retry of the submitted message");
      } finally {
        gate.release();
        await prompt;
        await b.close();
        await a.close();
      }
    },
  );
}

test("real SDK: new messages arrive after cancellation without a local prompt or resume command", async () => {
  const a = await make("fresh-after-cancel-a"),
    b = await make("fresh-after-cancel-b");
  const gate = hold();
  b.setGate(gate);
  let prompt;
  try {
    prompt = command(b, "work to cancel");
    await until(() => b.calls.length === 1);
    await b.session.abort();
    gate.release();
    await prompt;
    assert.equal((await send(a, b, "new finding")).details.status, "submitted");
    await until(() => b.calls.length === 2 && b.session.isIdle);
    assert.ok(hasPeer(b, "new finding"));
  } finally {
    gate.release();
    await prompt;
    await b.close();
    await a.close();
  }
});

test("real SDK: preflight messages are admitted and later delivered exactly once", async () => {
  const preflight = hold();
  let entered = false,
    first = true;
  const a = await make("preflight-a"),
    b = await make("preflight-b", {
      extra: (pi) =>
        pi.on("before_agent_start", async () => {
          if (!first) return;
          first = false;
          entered = true;
          await preflight.promise;
        }),
    });
  let prompt;
  try {
    prompt = command(b, "initial user request");
    await until(() => entered);
    for (const text of ["first preflight message", "second preflight message"]) {
      assert.equal((await send(a, b, text)).details.status, "queued");
    }
    preflight.release();
    await prompt;
    await until(
      () =>
        hasPeer(b, "first preflight message") &&
        hasPeer(b, "second preflight message") &&
        b.session.isIdle,
    );
    const texts = b.session.agent.state.messages
      .filter((m) => m.role === "custom")
      .map((m) => m.details?.text);
    assert.deepEqual(texts, ["first preflight message", "second preflight message"]);
    assert.deepEqual(b.errors, []);
  } finally {
    preflight.release();
    await prompt;
    await b.close();
    await a.close();
  }
});

test("real SDK: loaded managed sessions remain discoverable and reload changes incarnation", async () => {
  const a = await make("managed-a", { managed: true }),
    b = await make("managed-b");
  try {
    assert.ok(a.peer);
    assert.ok(b.peer);
    await send(b, a, "hello child");
    await until(() => a.calls.length === 1 && a.session.isIdle);
    const old = a.peer.instanceId;
    await a.session.reload();
    const listing = await (await import("./support/sdk.mjs"))
      .tool(b, "list_pi")
      .execute("listing", {});
    assert.ok(!listing.details.peers.some((peer) => peer.instanceId === old));
    assert.ok(listing.details.peers.some((peer) => peer.name === "managed-a"));
  } finally {
    await b.close();
    await a.close();
  }
});
