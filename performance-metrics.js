// In-process diagnostics. Samples are bounded so profiling cannot become a
// second source of memory pressure. Values are milliseconds.
export function createPerformanceMetrics({ maxSamples = 200 } = {}) {
  const limit = Math.max(20, Math.min(2000, Number(maxSamples) || 200));
  const series = new Map();
  const record = (name, durationMs, meta = {}) => {
    if (typeof name !== 'string' || !name || !Number.isFinite(durationMs)) return;
    const key = name.slice(0, 100);
    let item = series.get(key);
    if (!item) { item = { count: 0, errors: 0, totalMs: 0, totalTokens: 0, maxMs: 0, samples: [] }; series.set(key, item); }
    const value = Math.max(0, Number(durationMs));
    item.count++;
    item.totalMs += value;
    if (Number.isFinite(meta.tokens) && meta.tokens >= 0) item.totalTokens += meta.tokens;
    item.maxMs = Math.max(item.maxMs, value);
    item.samples.push(value);
    if (item.samples.length > limit) item.samples.splice(0, item.samples.length - limit);
    if (meta.error) item.errors++;
  };
  const time = async (name, operation) => {
    const started = performance.now();
    let recorded = false;
    try { return await operation(); }
    catch (error) { record(name, performance.now() - started, { error: true }); recorded = true; throw error; }
    finally { if (!recorded) record(name, performance.now() - started); }
  };
  const percentile = (values, p) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] * 100) / 100;
  };
  const snapshot = () => {
    const metrics = {};
    for (const [name, item] of series) metrics[name] = {
      count: item.count, errors: item.errors,
      averageMs: item.count ? Math.round(item.totalMs / item.count * 100) / 100 : 0,
      p50Ms: percentile(item.samples, .5), p95Ms: percentile(item.samples, .95),
      maxMs: Math.round(item.maxMs * 100) / 100,
      ...(item.totalTokens ? { tokens: item.totalTokens, tokensPerSecond: Math.round(item.totalTokens / Math.max(0.001, item.totalMs / 1000) * 100) / 100 } : {}),
    };
    return { capturedAt: new Date().toISOString(), metrics };
  };
  const reset = () => series.clear();
  return { record, time, snapshot, reset };
}
