import fs from 'node:fs';
import path from 'node:path';

export const AUDIT_STATUS = Object.freeze({ READY: 'READY', IMPLEMENTED_BUT_UNTESTED: 'IMPLEMENTED_BUT_UNTESTED', NEEDS_FIX: 'NEEDS_FIX', NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', REQUIRES_CREDENTIALS: 'REQUIRES_CREDENTIALS', REQUIRES_OWNER_APPROVAL: 'REQUIRES_OWNER_APPROVAL' });

const exists = (root, file) => { try { return fs.existsSync(path.join(root, file)); } catch { return false; } };

/** Truthful, local production readiness audit. No network calls, no inferred success. */
export function runProductionAudit({ root = process.cwd(), settings = {}, workflow = null } = {}) {
  const modelConfigured = Boolean(settings.provider && settings.model);
  const telegram = settings.integrations?.telegram || Object.values(settings.integrations || {}).find(item => item?.type === 'telegram') || {};
  const telegramConfigured = Boolean(telegram.token && (telegram.telegramOwnerUserId || telegram.ownerUserId) && (telegram.telegramChatId || telegram.chatId));
  const checks = [
    { id: 'repository', area: 'infrastructure', status: exists(root, '.git') ? AUDIT_STATUS.READY : AUDIT_STATUS.NEEDS_FIX, evidence: exists(root, '.git') ? '.git' : null },
    { id: 'frontend', area: 'frontend', status: exists(root, 'src/App.jsx') && exists(root, 'dist/index.html') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NEEDS_FIX, evidence: exists(root, 'src/App.jsx') ? 'src/App.jsx + dist' : null },
    { id: 'persistent-workflow', area: 'orchestration', status: exists(root, 'office-workflow.js') && workflow ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'office-workflow.js') ? 'office-workflow.js' : null },
    { id: 'agent-registry', area: 'agents', status: exists(root, 'public/team.json') ? AUDIT_STATUS.READY : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'public/team.json') ? 'public/team.json' : null },
    { id: 'model-gateway', area: 'models', status: modelConfigured ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.REQUIRES_CREDENTIALS, evidence: modelConfigured ? { provider: settings.provider, model: settings.model } : null },
    { id: 'telegram-production', area: 'integrations', status: telegramConfigured ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.REQUIRES_CREDENTIALS, evidence: telegramConfigured ? 'token + numeric owner/chat configured' : null },
    { id: 'worker-recovery', area: 'reliability', status: exists(root, 'office-workflow.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'office-workflow.js') ? 'workflow persistence/recovery code' : null },
    { id: 'quality-gates', area: 'quality', status: exists(root, 'quality-metrics.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'quality-metrics.js') ? 'quality-metrics.js' : null },
    { id: 'meeting-engine', area: 'orchestration', status: exists(root, 'office-workflow.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'office-workflow.js') ? 'meeting/task workflow' : null },
    { id: 'task-queue-worker', area: 'reliability', status: exists(root, 'server.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'server.js') ? 'persistent state + worker loop' : null },
    { id: 'artifact-storage', area: 'storage', status: exists(root, 'office-workflow.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'office-workflow.js') ? 'hashed local artifacts' : null },
    { id: 'code-sandbox', area: 'security', status: exists(root, 'coding-workspace.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'coding-workspace.js') ? 'coding workspace policy' : null },
    { id: 'image-generation', area: 'pipelines', status: exists(root, 'office-workflow.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'office-workflow.js') ? 'SVG/PNG flyer pipeline' : null },
    { id: 'database-postgres', area: 'deployment', status: exists(root, 'storage-postgres.js') ? AUDIT_STATUS.REQUIRES_CREDENTIALS : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'storage-postgres.js') ? 'storage-postgres.js' : null },
    { id: 'video-rendering', area: 'pipelines', status: AUDIT_STATUS.NOT_IMPLEMENTED, evidence: null },
    { id: 'social-publishing', area: 'pipelines', status: AUDIT_STATUS.REQUIRES_OWNER_APPROVAL, evidence: null },
    { id: 'backup-restore-test', area: 'reliability', status: exists(root, 'server.js') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'server.js') ? 'backup manifest + verify endpoint' : null },
    { id: 'production-deployment', area: 'deployment', status: exists(root, 'Dockerfile') && exists(root, 'docker-compose.stage9.yml') ? AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED : AUDIT_STATUS.NOT_IMPLEMENTED, evidence: exists(root, 'Dockerfile') ? 'deployment templates only' : null },
  ];
  const counts = Object.fromEntries(Object.values(AUDIT_STATUS).map(s => [s, checks.filter(c => c.status === s).length]));
  return { generatedAt: new Date().toISOString(), scope: 'local repository and configured settings', checks, counts, productionReady: checks.every(c => c.status === AUDIT_STATUS.READY), caveat: 'Status READY hanya untuk bukti lokal; integrasi eksternal tetap memerlukan pengujian dan kredensial.' };
}
