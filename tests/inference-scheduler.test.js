import test from 'node:test';
import assert from 'node:assert/strict';
import { createInferenceScheduler } from '../inference-scheduler.js';

test('scheduler prioritizes interactive work and drops canceled queued work', async () => {
  const order = [];
  let release;
  const scheduler = createInferenceScheduler({ concurrency: 1, maxQueue: 4 });
  const first = scheduler.submit(() => new Promise(resolve => { release = () => { order.push('first'); resolve('first'); }; }), { lane: 'background', priority: 1 });
  const canceled = new AbortController();
  const second = scheduler.submit(() => { order.push('canceled-ran'); return 'bad'; }, { lane: 'background', signal: canceled.signal });
  const chat = scheduler.submit(() => { order.push('chat'); return 'chat'; }, { lane: 'interactive', priority: 100 });
  canceled.abort();
  await assert.rejects(second, /dibatalkan|aborted/i);
  await Promise.resolve();
  release();
  assert.equal(await first, 'first');
  assert.equal(await chat, 'chat');
  assert.deepEqual(order, ['first', 'chat']);
});
