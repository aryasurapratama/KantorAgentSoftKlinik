import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceMonitor } from '../resource-monitor.js';

test('resource monitor records bounded RAM and CPU telemetry', () => {
  const fakeProcess = {
    memoryUsage: () => ({ rss: 210 * 1024 ** 2, heapUsed: 100, heapTotal: 200, external: 10, arrayBuffers: 2 }),
    cpuUsage: previous => previous ? { user: 100, system: 20 } : { user: 0, system: 0 },
    hrtime: { bigint: (() => { let value = 1_000_000_000n; return () => (value += 100_000_000n); })() },
  };
  const monitor = createResourceMonitor({ processApi: fakeProcess, osApi: { cpus: () => [{}, {}], loadavg: () => [1, 2, 3] }, memoryLimitBytes: 256 * 1024 ** 2, maxSamples: 10 });
  const sample = monitor.add();
  assert.equal(sample.rssBytes, 210 * 1024 ** 2);
  assert.equal(sample.memoryRatio, 0.8203);
  assert.equal(monitor.snapshot().warning, true);
  assert.equal(monitor.snapshot().cpuCount, 2);
});
