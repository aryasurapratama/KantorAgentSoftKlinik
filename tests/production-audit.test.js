import test from 'node:test';
import assert from 'node:assert/strict';
import { runProductionAudit, AUDIT_STATUS } from '../production-audit.js';

test('production audit is truthful when credentials are absent', () => {
  const report = runProductionAudit({ root: process.cwd(), settings: {}, workflow: null });
  assert.equal(report.productionReady, false);
  assert.ok(report.checks.some(c => c.status === AUDIT_STATUS.REQUIRES_CREDENTIALS));
  assert.ok(report.checks.some(c => c.id === 'video-rendering' && c.status === AUDIT_STATUS.NOT_IMPLEMENTED));
});

test('configured model and Telegram remain unverified', () => {
  const report = runProductionAudit({ settings: { provider: 'x', model: 'y', integrations: { telegram: { token: 't', ownerUserId: '1', telegramChatId: '2' } } } });
  assert.equal(report.checks.find(c => c.id === 'model-gateway').status, AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED);
  assert.equal(report.checks.find(c => c.id === 'telegram-production').status, AUDIT_STATUS.IMPLEMENTED_BUT_UNTESTED);
});
