import test from "node:test";
import assert from "node:assert/strict";
import { make, send, command, until, hold, hasPeer } from "./support/sdk.mjs";

for (const outcome of ["terminal-error", "retry-abort", "retry-success"]) {
  test(
    `real SDK ${outcome}: admitted mail remains available without manual reopening`,
    { timeout: 15000 },
    async () => {
      const a = await make(`${outcome}-a`),
        b = await make(`${outcome}-b`, { retry: outcome !== "terminal-error" });
      const gate = hold();
      b.setGate(gate);
      b.setError("503 overloaded fixture");
      let prompt;
      try {
        prompt = command(b, "original user work");
        await until(() => b.calls.length === 1);
        assert.equal((await send(a, b, "queued finding A")).details.status, "queued");
        assert.equal((await send(a, b, "queued finding B")).details.status, "queued");
        gate.release();
        if (outcome === "retry-abort") {
          await until(() => b.events.includes("auto_retry_start") && b.session.isRetrying);
          await b.session.abort();
        }
        await prompt;
        const expected = outcome === "retry-success" ? 4 : 3;
        await until(() => b.calls.length === expected && b.session.isIdle);
        assert.ok(hasPeer(b, "queued finding A"));
        assert.ok(hasPeer(b, "queued finding B"));
        const peerTexts = b.session.agent.state.messages
          .filter((m) => m.role === "custom")
          .map((m) => m.details?.text);
        assert.deepEqual(peerTexts, ["queued finding A", "queued finding B"]);
        assert.equal(b.calls.filter((call) => call.response?.stopReason === "error").length, 1);
        assert.equal(
          b.calls.filter((call) => call.response?.stopReason === "stop").length,
          expected - 1,
        );
        assert.deepEqual(b.errors, []);
      } finally {
        gate.release();
        await prompt;
        await b.close();
        await a.close();
      }
    },
  );
}

test("real SDK: independent extension notifications do not close the peer inbox", async () => {
  const a = await make("notification-a"),
    b = await make("notification-b");
  try {
    for (let i = 0; i < 20; i++) {
      await b.session.sendCustomMessage(
        { customType: "fixture-notification", content: `completion ${i}`, display: true },
        { triggerTurn: true },
      );
      await until(() => b.calls.length === i + 1 && b.session.isIdle);
    }
    await send(a, b, "finding after notifications");
    await until(() => b.calls.length === 21 && b.session.isIdle);
    assert.ok(hasPeer(b, "finding after notifications"));
    assert.deepEqual(b.errors, []);
  } finally {
    await b.close();
    await a.close();
  }
});
