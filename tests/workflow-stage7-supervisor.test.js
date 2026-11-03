import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOfficeWorkflow } from '../office-workflow.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-'));
  const workflow = createOfficeWorkflow({ dataDir: dir, ask: async () => 'ok' });
  await workflow.init();
  t.after(async () => { await workflow.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return workflow;
}

test('supervisor detects stale execution and persists recovery event', async t => {
  const workflow = await fixture(t);
  const project = await workflow.create({ instruction: 'supervise' });
  const task = await workflow.createTask(project.id, { assignedAgent: 'developer' });
  await workflow.transitionTaskStatus(project.id, task.id, 'EXECUTING');
  await workflow.heartbeatTask(project.id, task.id);
  const scan = await workflow.monitorTasks({ now: Date.now() + 2_000, stuckAfterMs: 1_000 });
  assert.equal(scan.problems[0].kind, 'STUCK');
  const recovered = await workflow.recoverTask(project.id, task.id, { reason: 'stale heartbeat' });
  assert.equal(recovered.status, 'queued');
  assert.equal(workflow.supervisorStatus().recoveries, 1);
  assert.ok(recovered.events.some(event => event.type === 'TASK_STATUS'));
});

test('supervisor reassigns task once and preserves audit trail', async t => {
  const workflow = await fixture(t);
  const project = await workflow.create({ instruction: 'assign' });
  const task = await workflow.createTask(project.id, { assignedAgent: 'developer' });
  const reassigned = await workflow.reassignTask(project.id, task.id, { agentId: 'imam', reason: 'capacity' });
  assert.equal(reassigned.assignedAgent, 'imam');
  assert.equal(reassigned.reassignmentHistory.length, 1);
  assert.equal(reassigned.events.at(-1).type, 'TASK_REASSIGNED');
  await assert.rejects(workflow.reassignTask(project.id, task.id, { agentId: 'imam', maxReassignments: 1 }), /Batas pengalihan/);
});
