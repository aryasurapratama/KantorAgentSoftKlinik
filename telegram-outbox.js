import { createStorage } from './storage.js';

// Only terminal or owner-action states represent meaningful operational events.
// Queued/meeting/working/reviewing transitions are intentionally omitted to
// avoid flooding the owner's chat while a project is running.
export const TELEGRAM_REPORT_EVENT_TYPES = Object.freeze(new Set([
  'meeting', 'waiting_approval', 'completed', 'failed', 'blocked', 'cancelled', 'paused',
  'approve', 'reject', 'cancel', 'pause', 'resume', 'retry', 'revise'
]));

export function telegramReportEventKey(project, event) {
  const projectId = String(project?.id || project || '').trim();
  const type = String(event?.type || event?.status || '').trim().toLowerCase();
  if (!projectId || !type) return '';
  // correlationId is stable for a workflow transition. `at`/updatedAt keeps
  // separate transitions with the same type distinct while retries of the
  // same callback remain idempotent.
  const stamp = String(event?.eventId || event?.id || event?.at || event?.updatedAt || project?.updatedAt || '').trim();
  return `event:${projectId}:${type}:${stamp || 'state'}`;
}

function reportable(project, event) {
  if (!project || !event || typeof event !== 'object') return false;
  const type = String(event.type || '').toLowerCase();
  const status = String(event.status || project.status || '').toLowerCase();
  return TELEGRAM_REPORT_EVENT_TYPES.has(type) || TELEGRAM_REPORT_EVENT_TYPES.has(status);
}

const schema = value => value?.schemaVersion === 1 && Array.isArray(value.notifications) && value.notifications.length <= 1000 && value.notifications.every(item => item && typeof item.key === 'string' && item.key.length <= 300 && ['pending', 'sending', 'sent', 'failed'].includes(item.status));

export function createTelegramOutbox({ dataDir = 'data', deliver, deliveryTimeoutMs = 30000 } = {}) {
  if (typeof deliver !== 'function') throw new TypeError('deliver required');
  const timeoutMs = Number.isFinite(deliveryTimeoutMs) && deliveryTimeoutMs > 0 ? deliveryTimeoutMs : 30000;
  let storage, state = { schemaVersion: 1, notifications: [] }, queue = Promise.resolve(), ready = false, closed = false;
  const load = async () => { if (ready) return; storage = await createStorage({ dataDir }); state = await storage.readJson('notifications.json', state, schema); for (const item of state.notifications) if (item.status === 'sending') { item.status = 'failed'; item.error = 'Pengiriman tidak pasti saat server berhenti.'; } ready = true; };
  const save = () => storage.writeJson('notifications.json', state);
  const run = async () => { await load(); for (const item of state.notifications) { if (item.status !== 'pending') continue; item.status = 'sending'; await save(); let timer; try {
      const delivery = Promise.resolve().then(() => deliver(structuredClone(item)));
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Telegram delivery timed out after ${timeoutMs} ms`)), timeoutMs); timer.unref?.(); });
      await Promise.race([delivery, timeout]); item.status = 'sent'; item.sentAt = new Date().toISOString();
    } catch (error) { item.status = 'failed'; item.error = String(error?.message || error).slice(0, 1000); } finally { if (timer) clearTimeout(timer); } await save(); } };
  const init = async () => { await load(); await save(); queue = queue.then(run); await queue; };
  const enqueue = async input => { await load(); if (closed) throw new Error('Outbox ditutup'); const key = String(input?.key || ''); if (!key || key.length > 300) throw new Error('notification key required'); const old = state.notifications.find(item => item.key === key); if (old) return structuredClone(old); const item = { ...input, key, status: 'pending', createdAt: new Date().toISOString() }; state.notifications.push(item); if (state.notifications.length > 1000) state.notifications = state.notifications.filter(entry => entry.status === 'pending' || entry === item).slice(-1000); await save(); queue = queue.then(run); return structuredClone(item); };
  const enqueueEvent = async ({ project, event, enabled = true, ...extra } = {}) => {
    if (enabled === false || !reportable(project, event)) return null;
    const key = telegramReportEventKey(project, event);
    if (!key) return null;
    return enqueue({ ...extra, key, projectId: String(project.id), event: structuredClone(event) });
  };
  const enqueueSummary = async ({ key, text, projectId = 'summary', enabled = true, ...extra } = {}) => {
    if (enabled === false || typeof text !== 'string' || !text.trim()) return null;
    const summaryKey = String(key || '').trim();
    if (!summaryKey || summaryKey.length > 300) throw new Error('summary key required');
    return enqueue({ ...extra, key: `summary:${summaryKey}`, projectId: String(projectId), event: { type: 'summary', text: text.slice(0, 4000) } });
  };
  return { init, enqueue, enqueueEvent, enqueueSummary, flush: async () => { await queue; }, snapshot: async () => { await load(); return structuredClone(state); }, close: async () => { await queue; closed = true; await save(); } };
}
