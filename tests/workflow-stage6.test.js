import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOfficeWorkflow } from '../office-workflow.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stage6-'));
  const workflow = createOfficeWorkflow({ dataDir: dir, ask: async () => 'ok' });
  await workflow.init();
  t.after(async () => { await workflow.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return workflow;
}

test('stage6 task lifecycle and correlation event persist', async t => {
  const workflow = await fixture(t);
  const project = await workflow.create({ instruction: 'general task' });
  const task = await workflow.createTask(project.id, { assignedAgent: 'developer', correlationId: 'corr-1' });
  assert.equal(task.lifecycleStatus, 'QUEUED');
  assert.equal(task.events.at(-1).correlationId, 'corr-1');
  assert.equal(workflow.snapshot().projects[0].events[0].to, 'QUEUED');
});

test('stage6 campaign records remain bounded and persistent', async t => {
  const workflow = await fixture(t);
  const campaign = await workflow.createCampaign({ objective: 'Flyer SoftKlinik', channels: ['instagram', 'instagram'] });
  assert.equal(campaign.status, 'DRAFT');
  assert.deepEqual(campaign.channels, ['instagram']);
  const active = await workflow.updateCampaign(campaign.id, { status: 'ACTIVE' });
  assert.equal(active.events.at(-1).to, 'ACTIVE');
  assert.equal(workflow.listCampaigns()[0].status, 'ACTIVE');
  await assert.rejects(workflow.deleteCampaign(campaign.id), error => error.status === 403);
  await workflow.deleteCampaign(campaign.id, { approved: true, actorId: 'owner' });
  assert.equal(workflow.listCampaigns().length, 0);
});
