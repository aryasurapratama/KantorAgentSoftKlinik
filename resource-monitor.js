import os from 'node:os';

const now = () => new Date().toISOString();

/** Bounded process resource telemetry. No external calls, no invented values. */
export function createResourceMonitor({
  memoryLimitBytes = 12 * 1024 ** 3,
  sampleIntervalMs = 30_000,
  maxSamples = 120,
  processApi = process,
  osApi = os,
} = {}) {
  const samples = [];
  let timer = null;
  let previousCpu = processApi.cpuUsage();
  let previousAt = processApi.hrtime.bigint();
  const boundedLimit = Math.max(256 * 1024 ** 2, Number(memoryLimitBytes) || 12 * 1024 ** 3);
  const add = () => {
    const usage = processApi.memoryUsage();
    const at = processApi.hrtime.bigint();
    const elapsedMicros = Math.max(1, Number(at - previousAt) / 1000);
    const cpu = processApi.cpuUsage(previousCpu);
    previousCpu = processApi.cpuUsage();
    previousAt = at;
    const rssBytes = Number(usage.rss) || 0;
    const cpuPercent = Math.max(0, Math.min(100 * Math.max(1, osApi.cpus().length || 1), ((cpu.user + cpu.system) / elapsedMicros) * 100));
    const sample = {
      at: now(),
      rssBytes,
      heapUsedBytes: Number(usage.heapUsed) || 0,
      heapTotalBytes: Number(usage.heapTotal) || 0,
      externalBytes: Number(usage.external) || 0,
      arrayBuffersBytes: Number(usage.arrayBuffers) || 0,
      cpuPercent: Number(cpuPercent.toFixed(2)),
      memoryLimitBytes: boundedLimit,
      memoryRatio: Number((rssBytes / boundedLimit).toFixed(4)),
    };
    samples.push(sample);
    while (samples.length > Math.max(10, Math.min(2000, maxSamples))) samples.shift();
    return sample;
  };
  const start = (intervalMs = sampleIntervalMs) => { if (!timer) { add(); timer = setInterval(add, Math.max(1000, Number(intervalMs) || sampleIntervalMs)); timer.unref?.(); } return snapshot(); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const snapshot = () => {
    const latest = samples.at(-1) || add();
    return { latest: structuredClone(latest), samples: samples.length, warning: latest.memoryRatio >= 0.8, exceeded: latest.memoryRatio >= 0.95, cpuCount: osApi.cpus().length || 1, loadAverage: osApi.loadavg?.() || [0, 0, 0], sampledAt: latest.at };
  };
  return { add, start, stop, snapshot };
}
