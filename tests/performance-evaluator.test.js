import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEmployee } from '../performance-evaluator.js';

test('performance evaluator uses actual task and independent evidence', () => {
  const result = evaluateEmployee('developer', [
    { assignedAgent: 'developer', status: 'completed', quality: { score: 9.8 } },
    { assignedAgent: 'developer', status: 'failed' },
  ], { independent: [{ agentId: 'developer', score: 9.4 }] });
  assert.equal(result.evidence.tasks, 2);
  assert.equal(result.evidence.failed, 1);
  assert.equal(result.passed, false);
  assert.ok(result.score > 0 && result.score < 10);
});
