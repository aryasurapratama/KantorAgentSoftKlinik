import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCodingTask } from '../coding-task-runner.js';

function fixture({ noChange = false, jobStatus = 'completed', checkFails = false } = {}) {
  const events = [];
  const proposal = { id: 'proposal', status: 'proposed', codingJobId: 'job', changedFiles: noChange ? [] : ['app.js'], diffHash: 'a'.repeat(64), checks: [{ name: 'tests', passed: !checkFails }, { name: 'build', passed: true }] };
  const maintenance = {
    create: async () => { events.push('create'); return structuredClone(proposal); },
    code: async () => { events.push('code'); return structuredClone(proposal); },
    validate: async () => { events.push('validate'); return { ...structuredClone(proposal), status: 'validated' }; },
    preparePullRequest: async () => { events.push('prepare'); return { ...structuredClone(proposal), status: 'validated' }; },
    dispose: async () => { events.push('dispose'); },
    failProposal: async () => { events.push('fail'); },
  };
  const coding = { getJob: () => ({ id: 'job', status: jobStatus }), cancelJob: async () => { events.push('cancel'); } };
  return { maintenance, coding, events };
}

test('coding task requires diff plus both passing checks before review delivery', async () => {
  const x = fixture(); const result = await executeCodingTask({ ...x, instruction: 'Fix parser' });
  assert.equal(result.status, 'validated'); assert.equal(result.proposalId, 'proposal');
  assert.deepEqual(x.events, ['create', 'code', 'validate', 'prepare']);
  for (const options of [{ noChange: true }, { checkFails: true }, { jobStatus: 'failed' }]) {
    const y = fixture(options); await assert.rejects(executeCodingTask({ ...y, instruction: 'Fix parser' }));
    assert.equal(y.events.includes('prepare'), false); assert.equal(y.events.includes('fail'), true); assert.equal(y.events.includes('dispose'), false);
  }
});

test('cancelling a coding task stops its actual process and frees proposal', async () => {
  const x = fixture({ jobStatus: 'running' }); const controller = new AbortController();
  const work = executeCodingTask({ ...x, instruction: 'Fix parser', signal: controller.signal, pollMs: 1 });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(work, { name: 'AbortError' });
  assert.equal(x.events.includes('cancel'), true); assert.equal(x.events.includes('fail'), true); assert.equal(x.events.includes('dispose'), false);
});

