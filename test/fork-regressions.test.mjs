import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { component, wire, message, info } from './support/component.mjs';

async function fixtures(fn, options = {}) {
  const sender = await component('fork-sender');
  const receiver = await component('fork-receiver', { rpc: true, ...options });
  try { await fn(sender, receiver); }
  finally { await receiver.close(); await sender.close(); }
}
const gate = (host, toolName, input = {}, toolCallId = randomUUID()) => host.emit('tool_call', { toolName, input, toolCallId });
async function goalDelivery(sender, host) {
  await host.busy();
  const { details: { goalId } } = await host.tool('peer_goal', { action: 'start', objective: 'Repair and verify the authorized project' });
  await host.tool('peer_goal', { action: 'bind', goalId, peerIds: [sender.peer.instanceId] });
  await host.settled();
  assert.equal((await wire(sender, host, message('continue authorized work', { goalId }))).status, 'submitted');
  host.setIdle(false); host.controller = new AbortController(); host.ctx.signal = host.controller.signal;
  await host.emit('agent_start');
  return goalId;
}

for (const timing of ['before', 'during discovery']) {
  test(`outgoing tool cancellation ${timing} prevents submission`, async () => fixtures(async (a, b) => {
    await a.busy();
    if (timing === 'before') a.controller.abort();
    const sending = a.ext.tools.get('send_pi_message').definition.execute(randomUUID(), {
      target: b.peer.instanceId, message: 'must not arrive',
    }, a.controller.signal, undefined, a.ctx);
    if (timing === 'during discovery') a.controller.abort();
    await assert.rejects(sending, error => error.code === 'cancelled_before_send' && error.state === 'not_sent');
    assert.equal(b.calls.length, 0);
  }));
}

test('goal scope supports direct pi-subagents launches and exact owned controls, never management', async () => fixtures(async (a, b) => {
  await goalDelivery(a, b);
  assert.equal(await gate(b, 'subagents_enable'), undefined);
  assert.equal(await gate(b, 'subagent', { agent: 'worker', task: 'repair', async: true }, 'launch'), undefined);
  await b.emit('tool_result', { toolName: 'subagent', toolCallId: 'launch', details: { runId: 'owned-run', asyncId: 'owned-run', mode: 'single' }, isError: false });
  for (const action of ['steer', 'resume', 'interrupt', 'stop', 'command.cancel', 'command.yield']) {
    assert.equal(await gate(b, 'subagent', { action, id: 'owned-run', message: 'continue' }), undefined, action);
    assert.equal((await gate(b, 'subagent', { action, id: 'foreign' }))?.block, true, action);
    assert.equal((await gate(b, 'subagent', { action, id: 'owned' }))?.block, true, 'prefix not ownership');
  }
  assert.equal(await gate(b, 'subagent', { action: 'resume', options: { runId: 'owned-run' } }, 'resume'), undefined);
  await b.emit('tool_result', { toolName: 'subagent', toolCallId: 'resume', details: { runId: 'revived-run' }, isError: false });
  assert.equal(await gate(b, 'subagent', { action: 'steer', id: 'revived-run' }), undefined);
  for (const input of [
    { action: 'schedule.create', agent: 'worker' }, { action: 'update', agent: 'worker' },
    { action: 'worktree.cleanup' }, { action: 'unknown' }, { workflow: true },
    { agent: 'worker', task: 'repair', options: { reuseFrom: 'foreign' } },
    { action: 'resume', id: 'owned-run', options: { id: 'foreign' } },
    { action: 'resume', id: 'owned-run', options: { runId: 'foreign' } },
  ]) assert.equal((await gate(b, 'subagent', input))?.block, true, JSON.stringify(input));
}));

test('pi-subagents completion notices retain revoked goal ownership, including failed launch receipts', async () => fixtures(async (a, b) => {
  const goalId = await goalDelivery(a, b);
  await gate(b, 'subagent', { agent: 'worker', task: 'repair' }, 'launch');
  await b.emit('tool_result', { toolName: 'subagent', toolCallId: 'launch', details: { runId: 'late-owned' }, isError: true });
  await b.tool('peer_goal', { action: 'complete', goalId });
  await b.settled();
  await b.busy('extension');
  await b.emit('message_start', { message: { role: 'custom', customType: 'subagent-notify', details: { runs: [{ id: 'late-owned', runId: 'late-owned', source: 'async' }] } } });
  assert.equal((await gate(b, 'subagent', { agent: 'worker', task: 'must not restart' }))?.block, true);
  assert.equal((await gate(b, 'Agent', { prompt: 'must not restart' }))?.block, true);
}));

test('receipt tool queries exact sender-qualified queued/submitted states without another message', async () => fixtures(async (a, b) => {
  await b.busy();
  const sent = await a.tool('send_pi_message', { target: b.peer.instanceId, message: 'receipt probe' });
  assert.equal(sent.details.status, 'queued');
  assert.ok(sent.details.expiresAt > Date.now() + 30_000);
  const query = { target: b.peer.instanceId, messageId: sent.details.messageId };
  assert.equal((await a.tool('get_pi_message_status', query)).details.status, 'queued');
  await b.settled();
  assert.equal((await a.tool('get_pi_message_status', query)).details.status, 'submitted');
  assert.equal(b.calls.length, 1);
}));

test('default queue retains work beyond 30 seconds but still expires at its bound', async t => fixtures(async (a, b) => {
  await b.busy();
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const sent = await wire(a, b, message('long coding turn'));
  assert.equal(sent.status, 'queued');
  assert.equal(sent.expiresAt, now + 600_000);
  now += 31_000;
  await b.settled();
  assert.equal(b.calls.length, 1);
  await b.busy();
  assert.equal((await wire(a, b, message('expire at bound'))).status, 'queued');
  now += 600_001;
  await b.settled();
  assert.equal(b.calls.length, 1);
  assert.equal(info(b).states.at(-1).state, 'expired');
}));

test('auto-resume only follows a clean genuine user turn and never restores a goal or budget', async () => fixtures(async (a, b) => {
  b.runtime.flagValues.set('cross-session-auto-resume', true);
  const goalId = await goalDelivery(a, b);
  b.controller.abort(); await b.settled(false);
  assert.equal(info(b).stopped, true);
  const budget = info(b).remainingBudget;
  await b.busy('extension'); await b.settled();
  assert.equal(info(b).stopped, true);
  await b.busy();
  assert.equal((await wire(a, b, message('not before settlement'))).status, 'stopped');
  await b.settled();
  assert.equal(info(b).stopped, false);
  assert.equal(info(b).remainingBudget, budget);
  assert.equal((await b.tool('peer_goal', { action: 'status' })).details.goalId, null);
  assert.equal((await wire(a, b, message('revoked goal', { goalId }))).status, 'goal_not_authorized');
  assert.equal((await wire(a, b, message('new ordinary message'))).status, 'submitted');
}));

test('default guard blocks unscoped authority, with explicit legacy opt-out', async () => fixtures(async (a, b) => {
  b.runtime.flagValues.delete('cross-session-guard');
  await wire(a, b, message('unscoped peer'));
  for (const name of ['subagent', 'subagents_enable', 'Agent', 'set_config']) {
    assert.equal((await gate(b, name))?.block, true, name);
  }
  b.runtime.flagValues.set('cross-session-guard', false);
  assert.equal(await gate(b, 'subagent'), undefined);
}));
