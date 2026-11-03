import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmployee, inferenceMetrics, summarizeMetrics, validateProjectIsolation, canUseTool } from '../quality-metrics.js';

test('employee registry normalizes identity, org fields and tool permissions', () => {
  const employee = normalizeEmployee({ id: 'developer', name: ' Dev ', role: 'Developer', departmentId: 'engineering', tools: ['model', 'model'], permissions: ['project:read'] });
  assert.deepEqual(employee, { id: 'developer', name: 'Dev', role: 'Developer', department: 'engineering', description: '', virtual: false, modelPolicy: 'default', tools: ['model'], permissions: ['project:read'] });
});

test('inference metrics retain actual usage, duration and failure state', () => {
  const row = inferenceMetrics({ requestId: 'r1', agentId: 'developer', provider: 'ollama', model: 'qwen', status: 'completed', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:01.250Z', usage: { inputTokens: 11, outputTokens: 7 } });
  assert.equal(row.durationMs, 1250); assert.equal(row.totalTokens, 18); assert.equal(row.failed, false);
  const summary = summarizeMetrics([row, { status: 'failed', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:02Z', error: 'provider down' }]);
  assert.equal(summary.failures, 1); assert.equal(summary.totalTokens, 18); assert.equal(summary.failureRate, 0.5);
});

test('project isolation rejects cross-project nested records', () => {
  assert.equal(validateProjectIsolation({ id: 'p1', tasks: [{ projectId: 'p1' }] }, 'p1'), true);
  assert.equal(validateProjectIsolation({ id: 'p1', tasks: [{ projectId: 'p2' }] }, 'p1'), false);
  assert.equal(canUseTool({ tools: ['model'] }, 'model', { projectId: 'p1', resourceProjectId: 'p1' }), true);
  assert.equal(canUseTool({ tools: ['model'] }, 'model', { projectId: 'p1', resourceProjectId: 'p2' }), false);
  assert.equal(canUseTool({ tools: ['model'] }, 'shell', { projectId: 'p1' }), false);
});
