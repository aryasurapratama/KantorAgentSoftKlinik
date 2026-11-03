import { randomUUID } from 'node:crypto';
const RISK = Object.freeze({ low: 'LOW', medium: 'MEDIUM', high: 'HIGH' });
const ACTION_RISK = new Map([
  ['meeting', RISK.low], ['status', RISK.low], ['report', RISK.low], ['evaluate', RISK.low],
  ['draft', RISK.low], ['test', RISK.low], ['preview', RISK.medium], ['content_prepare', RISK.medium],
  ['artifact_generate', RISK.medium], ['approve', RISK.high], ['publish', RISK.high],
  ['publication', RISK.high], ['deploy', RISK.high], ['delete', RISK.high], ['payment', RISK.high],
  ['send_sensitive', RISK.high], ['reject', RISK.medium], ['revise', RISK.medium],
]);

export function classifyAction(action, context = {}) {
  const key = String(action || '').trim().toLowerCase();
  const risk = ACTION_RISK.get(key) || (context.external === true ? RISK.high : RISK.medium);
  return { action: key, risk, requiresApproval: risk === RISK.high || (risk === RISK.medium && context.autoApprove !== true), reason: risk === RISK.high ? 'Tindakan berdampak eksternal atau sulit dibatalkan.' : risk === RISK.medium ? 'Tindakan memakai sumber daya atau mengubah hasil kerja.' : 'Tindakan internal berisiko rendah.' };
}

export function approvalRecord({ action, actorId, projectId, source = 'unknown', approved = false, evidence = {}, at = new Date().toISOString() } = {}) {
  const policy = classifyAction(action);
  return { id: typeof evidence.id === 'string' ? evidence.id : randomUUID(), action: policy.action, risk: policy.risk, projectId: projectId || null, actorId: actorId || null, source, approved: approved === true, policy, evidence: { ...evidence }, createdAt: at };
}

export const APPROVAL_RISK = RISK;
