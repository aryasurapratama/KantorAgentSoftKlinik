import test from 'node:test';
import assert from 'node:assert/strict';
import { REASONING_PHASES, createReasoningRun, advanceReasoning, createVersionManager, normalizeEmployeeProfile, recordError, runBenchmark } from '../stage8-intelligence.js';

test('reasoning workflow records bounded phases in order', () => {
  const run = createReasoningRun({ taskId: 't1', agentId: 'developer', projectId: 'p1' });
  assert.throws(() => advanceReasoning(run, 'EXECUTE'), /out of order/);
  for (const phase of REASONING_PHASES) advanceReasoning(run, phase, { evidence: `${phase} evidence` });
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.phases.every(phase => phase.status === 'COMPLETED' && phase.evidence), true);
});

test('version manager supports active versions and rollback', () => {
  const manager = createVersionManager();
  manager.publish('prompt', 'developer', 'v1');
  manager.publish('prompt', 'developer', 'v2');
  assert.equal(manager.get('prompt', 'developer').value, 'v2');
  manager.rollback('prompt', 'developer', 1);
  assert.equal(manager.get('prompt', 'developer').value, 'v1');
});

test('profiles, errors and benchmarks retain evidence without unsupported scores', () => {
  const profile = normalizeEmployeeProfile({ id: 'developer', role: 'Developer', allowedTools: ['model'] }, { sop: ['test'], knowledge: ['coding'] });
  assert.deepEqual(profile.sop, ['test']);
  const error = recordError({ agentId: 'developer', projectId: 'p1', message: 'build failed', severity: 'high' });
  assert.equal(error.resolved, false);
  const result = runBenchmark({ benchmarkId: 'coding-smoke', agentId: 'developer', cases: [{ ok: true }, { ok: false }], evaluator: input => ({ passed: input.ok, score: input.ok ? 9 : null, evidence: input.ok ? 'test passed' : null }) });
  assert.equal(result.passRate, 0.5);
  assert.equal(result.score, 9);
});
