const abortError = reason => reason instanceof Error ? reason : Object.assign(new Error(String(reason || 'Inference dibatalkan.')), { name: 'AbortError' });

/** Priority scheduler. Canceled queued jobs are discarded before provider work. */
export function createInferenceScheduler({ concurrency = 1, maxQueue = 40, getConcurrency, onMetric = () => {} } = {}) {
  const queue = [];
  let running = 0;
  let sequence = 0;
  let closed = false;
  const limit = () => Math.max(1, Math.min(2, Number(getConcurrency?.() ?? concurrency) || 1));
  const metric = (name, value, meta) => { try { onMetric(name, value, meta); } catch {} };
  const remove = entry => { const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); };
  const pick = () => {
    let selected = null;
    for (const item of queue) {
      if (item.signal?.aborted) { remove(item); item.signal.removeEventListener('abort', item.cancel); item.reject(abortError(item.signal.reason)); continue; }
      if (!selected || item.priority > selected.priority || item.priority === selected.priority && item.sequence < selected.sequence) selected = item;
    }
    if (selected) remove(selected);
    return selected;
  };
  const pump = () => {
    while (running < limit()) {
      const item = pick();
      if (!item) return;
      running++;
      const waitMs = performance.now() - item.queuedAt;
      metric('ai.queue_wait', waitMs, { lane: item.lane });
      Promise.resolve().then(() => item.run()).then(item.resolve, item.reject).finally(() => { item.signal?.removeEventListener('abort', item.cancel); running--; pump(); });
    }
  };
  const submit = (run, { priority = 0, lane = 'background', signal } = {}) => {
    if (closed) return Promise.reject(Object.assign(new Error('Inference scheduler ditutup.'), { name: 'AbortError' }));
    if (typeof run !== 'function') return Promise.reject(new TypeError('Inference operation required.'));
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));
    if (queue.length >= Math.max(1, maxQueue)) return Promise.reject(Object.assign(new Error('Antrean AI penuh. Tunggu tugas yang berjalan selesai.'), { code: 'QUEUE_FULL' }));
    return new Promise((resolve, reject) => {
      const entry = { run, resolve, reject, priority: Number(priority) || 0, lane, signal, queuedAt: performance.now(), sequence: sequence++ };
      queue.push(entry);
      entry.cancel = () => { if (queue.includes(entry)) { remove(entry); reject(abortError(signal.reason)); } };
      signal?.addEventListener('abort', entry.cancel, { once: true });
      pump();
    });
  };
  const close = () => { closed = true; while (queue.length) { const item = queue.shift(); item.signal?.removeEventListener('abort', item.cancel); item.reject(abortError('Inference scheduler ditutup.')); } };
  const snapshot = () => ({ queued: queue.length, running, concurrency: limit(), lanes: queue.reduce((out, item) => { out[item.lane] = (out[item.lane] || 0) + 1; return out; }, {}) });
  return { submit, pump, close, snapshot, get queued() { return queue.length; }, get running() { return running; } };
}
