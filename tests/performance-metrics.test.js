import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceMetrics } from '../performance-metrics.js';

test('performance metrics keeps bounded latency summaries and errors', async () => {
  const metrics = createPerformanceMetrics({ maxSamples: 20 });
  metrics.record('telegram.ack', 12);
  metrics.record('telegram.ack', 30, { error: true });
  await assert.rejects(metrics.time('telegram.dispatch', async () => { throw new Error('offline'); }), /offline/);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.metrics['telegram.ack'].count, 2);
  assert.equal(snapshot.metrics['telegram.ack'].errors, 1);
  assert.equal(snapshot.metrics['telegram.ack'].p50Ms, 12);
  assert.equal(snapshot.metrics['telegram.dispatch'].errors, 1);
});
