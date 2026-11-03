import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAction, approvalRecord, APPROVAL_RISK } from '../approval-policy.js';

test('approval policy separates low, medium, and high risk actions', () => {
  assert.equal(classifyAction('meeting').risk, APPROVAL_RISK.low);
  assert.equal(classifyAction('preview').requiresApproval, true);
  assert.equal(classifyAction('publish').risk, APPROVAL_RISK.high);
  assert.equal(approvalRecord({ action: 'publish', actorId: '42', projectId: 'p1', source: 'telegram' }).approved, false);
});
