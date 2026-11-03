import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSelfDevelopmentEngine } from '../self-development-engine.js';

const execFile = promisify(nodeExecFile);
async function git(cwd, ...args) { return execFile('git', args, { cwd, windowsHide: true }); }

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'self-development-'));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'self-development-data-'));
  await fs.writeFile(path.join(root, 'app.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node -e "process.exit(0)"' } }));
  await git(root, 'init', '--quiet'); await git(root, 'config', 'user.email', 'test@example.invalid'); await git(root, 'config', 'user.name', 'Test Owner'); await git(root, 'add', '.'); await git(root, 'commit', '-m', 'initial', '--quiet');
  const engine = createSelfDevelopmentEngine({ projectRoot: root, dataDir });
  return { root, dataDir, engine, close: async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(dataDir, { recursive: true, force: true }); } };
}

test('build gate compiles source before running optional bundle budget', async t => {
  for (const invalid of [true, false]) {
    const f = await fixture(); t.after(f.close);
    const manifest = { type: 'module', scripts: { test: 'node -e "process.exit(0)"', build: 'node --check app.js', 'check:build': 'node -e "process.exit(0)"' } };
    await fs.writeFile(path.join(f.root, 'package.json'), JSON.stringify(manifest));
    await git(f.root, 'add', 'package.json'); await git(f.root, 'commit', '-m', 'build gate fixture');
    const proposal = await f.engine.create({ request: 'Compile updated app' });
    await fs.writeFile(path.join(proposal.worktreePath, 'app.js'), invalid ? 'const = broken;' : 'export const value = 3;');
    const result = await f.engine.validate(proposal.id, { checks: ['tests', 'build'] });
    assert.equal(result.checks.find(row => row.name === 'tests').passed, true);
    assert.equal(result.checks.find(row => row.name === 'build').passed, !invalid);
    assert.equal(result.status, invalid ? 'failed' : 'validated');
    assert.equal(result.checks.some(row => row.name === 'build_budget' && row.passed), !invalid);
  }
});

test('self-development requires evidence, owner approval, and supports apply/rollback', async t => {
  const f = await fixture(); t.after(f.close);
  const proposal = await f.engine.create({ request: 'Perbaiki parser konfigurasi', target: 'bugfix' });
  assert.equal(proposal.status, 'proposed'); assert.equal(proposal.requiresApproval, true);
  await assert.rejects(f.engine.apply(proposal.id, { approved: true, actor: 'owner' }), /belum disetujui/);
  await fs.writeFile(path.join(proposal.worktreePath, 'app.js'), 'export const value = 2;\n');
  const validated = await f.engine.validate(proposal.id, { checks: ['tests'] });
  assert.equal(validated.status, 'validated'); assert.equal(validated.checks[0].passed, true); assert.match(validated.diffHash, /^[a-f0-9]{64}$/);
  await assert.rejects(f.engine.approve(proposal.id, { approved: true, actor: 'developer' }), /pemilik/);
  await f.engine.preparePullRequest(proposal.id, { title: 'Fix parser' });
  await f.engine.reviewPullRequest(proposal.id, { approved: true, actor: 'reviewer', summary: 'Tests passed and diff reviewed.' });
  await f.engine.approve(proposal.id, { approved: true, actor: 'owner' });
  const applied = await f.engine.apply(proposal.id, { approved: true, actor: 'owner' });
  assert.equal(applied.status, 'applied'); assert.equal((await fs.readFile(path.join(f.root, 'app.js'), 'utf8')).trim(), 'export const value = 2;');
  const rolled = await f.engine.rollback(proposal.id, { approved: true, actor: 'owner', reason: 'Regression detected' });
  assert.equal(rolled.status, 'rolled_back'); assert.equal((await fs.readFile(path.join(f.root, 'app.js'), 'utf8')).trim(), 'export const value = 1;');
});

test('self-development rejects empty or unsafe proposals and failing checks', async t => {
  const f = await fixture(); t.after(f.close);
  await assert.rejects(f.engine.create({ request: '' }), /Instruksi/);
  const proposal = await f.engine.create({ request: 'Ubah secret konfigurasi' });
  await fs.writeFile(path.join(proposal.worktreePath, '.env'), 'SECRET=leak\n');
  const result = await f.engine.validate(proposal.id, { checks: ['tests'] });
  assert.equal(result.status, 'failed'); assert.match(result.error || '', /terlarang|kode|kosong/i);
});

test('self-development records OBSERVE evidence and prepares a diff-locked PR descriptor', async t => {
  const f = await fixture(); t.after(f.close);
  const proposal = await f.engine.create({ request: 'Perbaiki parser', target: 'parser' });
  await fs.writeFile(path.join(proposal.worktreePath, 'app.js'), 'export const value = 2;\n');
  const observed = await f.engine.observe(proposal.id, { actor: 'qc' });
  assert.equal(observed.status, 'proposed');
  assert.equal(observed.observation.actor, 'qc');
  assert.deepEqual(observed.observation.files, ['app.js']);
  const validated = await f.engine.validate(proposal.id, { checks: ['tests'] });
  const prepared = await f.engine.preparePullRequest(proposal.id, { title: 'Fix parser', body: 'Evidence attached.' });
  assert.equal(prepared.status, 'validated');
  assert.equal(prepared.pullRequest.status, 'ready_for_review');
  assert.equal(prepared.pullRequest.diffHash, validated.diffHash);
  assert.equal(prepared.pullRequest.branch, proposal.branch);
});

test('proposal snapshots current files without including secrets or claiming baseline edits as agent work', async t => {
  const f = await fixture(); t.after(f.close);
  await fs.writeFile(path.join(f.root, 'app.js'), 'export const value = 7;\n');
  await git(f.root, 'add', 'app.js');
  await fs.writeFile(path.join(f.root, 'new module.js'), 'export const current = true;\n');
  await fs.writeFile(path.join(f.root, '.env'), 'SECRET=private\n');
  await fs.writeFile(path.join(f.root, 'coding-workspace.js'), 'export const latestRuntime = true;\n');
  const proposal = await f.engine.create({ request: 'Perbaiki fitur terbaru' });
  assert.equal(await fs.readFile(path.join(proposal.worktreePath, 'app.js'), 'utf8'), 'export const value = 7;\n');
  assert.equal(await fs.readFile(path.join(proposal.worktreePath, 'new module.js'), 'utf8'), 'export const current = true;\n');
  await assert.rejects(fs.access(path.join(proposal.worktreePath, '.env')));
  assert.match(await fs.readFile(path.join(proposal.worktreePath, 'coding-workspace.js'), 'utf8'), /latestRuntime/);
  const observed = await f.engine.observe(proposal.id);
  assert.equal(observed.observation.clean, true);
  const validated = await f.engine.validate(proposal.id, { checks: ['tests'] });
  assert.equal(validated.status, 'failed');
  assert.match(validated.error, /Belum ada perubahan/);
  assert.equal(await fs.readFile(path.join(f.root, '.env'), 'utf8'), 'SECRET=private\n');
});

