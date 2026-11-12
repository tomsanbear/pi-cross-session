import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { component } from "./support/component.mjs";
import { until } from "./support/sdk.mjs";

for (const timing of ["before", "during discovery"]) {
  test(`outgoing tool cancellation ${timing} still prevents an unsent message`, async () => {
    const a = await component("cancel-sender"),
      b = await component("cancel-receiver");
    try {
      await a.busy();
      if (timing === "before") a.controller.abort();
      const sending = a.ext.tools
        .get("send_pi_message")
        .definition.execute(
          randomUUID(),
          { target: b.peer.instanceId, message: "must not arrive" },
          a.controller.signal,
          undefined,
          a.ctx,
        );
      if (timing === "during discovery") a.controller.abort();
      await assert.rejects(
        sending,
        (error) => error.code === "cancelled_before_send" && error.state === "not_sent",
      );
      assert.equal(b.calls.length, 0);
    } finally {
      await b.close();
      await a.close();
    }
  });
}

test("receipt queries are exact and sender-qualified without causing resubmission", async () => {
  const a = await component("receipt-owner"),
    b = await component("receipt-host"),
    c = await component("receipt-stranger");
  try {
    await b.busy();
    const sent = await a.tool("send_pi_message", { target: b.peer.instanceId, message: "finding" });
    const query = { target: b.peer.instanceId, messageId: sent.details.messageId };
    assert.equal(sent.details.status, "queued");
    assert.equal((await a.tool("get_pi_message_status", query)).details.status, "queued");
    assert.equal((await c.tool("get_pi_message_status", query)).details.status, "unknown");
    await assert.rejects(
      a.tool("get_pi_message_status", { ...query, target: b.peer.name }),
      /invalid_request/,
    );
    await b.settled(false);
    await until(() => b.calls.length === 1);
    assert.equal((await a.tool("get_pi_message_status", query)).details.status, "submitted");
    assert.equal(b.calls.length, 1);
  } finally {
    await c.close();
    await b.close();
    await a.close();
  }
});
