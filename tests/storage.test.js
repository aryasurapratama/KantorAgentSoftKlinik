import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../storage.js';

async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kantor-storage-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  return { dataDir, storage: await createStorage({ dataDir }) };
}
test('JSON roundtrip, default, schema validation, restrictive mode', async t => {
  const { dataDir, storage } = await fixture(t);
  assert.deepEqual(await storage.readJson('state.json', { tasks: [] }), { tasks: [] });
  await storage.writeJson('state.json', { tasks: [1] });
  assert.deepEqual(await storage.readJson('state.json', {}, value => Array.isArray(value.tasks)), { tasks: [1] });
  assert.deepEqual(await storage.readJson('state.json', {}, () => false), {});
  await assert.rejects(storage.writeJson('../state.json', {}), /Invalid storage filename/);
  await storage.writeJson('state.json', { tasks: [] });
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(dataDir, 'state.json'))).mode & 0o777, 0o600);
});
test('corrupt primary recovers last valid backup and preserves corrupt bytes', async t => {
  const { dataDir, storage } = await fixture(t);
  await storage.writeJson('state.json', { version: 1 });
  await storage.writeJson('state.json', { version: 2 });
  await fs.writeFile(path.join(dataDir, 'state.json'), '{broken');
  assert.deepEqual(await storage.readJson('state.json', {}), { version: 1 });
  const corrupt = (await fs.readdir(dataDir)).find(name => name.includes('.corrupt-'));
  assert.equal(await fs.readFile(path.join(dataDir, corrupt), 'utf8'), '{broken');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'state.json'))), { version: 1 });
});
test('serialized writes snapshot values and retain preceding successful version', async t => {
  const { dataDir, storage } = await fixture(t);
  const value = { index: 0 };
  const jobs = [storage.writeJson('state.json', value)];
  value.index = -1;
  for (let index = 1; index < 30; index++) jobs.push(storage.writeJson('state.json', { index }));
  await Promise.all(jobs);
  assert.deepEqual(await storage.readJson('state.json', {}), { index: 29 });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'state.json.bak'))), { index: 28 });
  assert.equal((await fs.readdir(dataDir)).filter(name => name.endsWith('.tmp')).length, 0);
});
test('settings encrypt all credentials and survive reopening and corrupt recovery', async t => {
  const { dataDir, storage } = await fixture(t);
  const settings = { provider: 'test', apiKey: 'secret-api-key-123', integrations: { chat: { token: 'secret-token-456', clientSecret: 'secret-client-789' } } };
  await storage.writeSettings(settings);
  await storage.writeSettings({ ...settings, provider: 'next' });
  for (const name of ['settings.json', 'settings.json.bak']) {
    const raw = await fs.readFile(path.join(dataDir, name), 'utf8');
    for (const secret of [settings.apiKey, settings.integrations.chat.token, settings.integrations.chat.clientSecret]) assert.equal(raw.includes(secret), false);
  }
  const reopened = await createStorage({ dataDir });
  assert.deepEqual(await reopened.readSettings({}), { ...settings, provider: 'next' });
  await fs.writeFile(path.join(dataDir, 'settings.json'), '{broken');
  assert.deepEqual(await reopened.readSettings({}), settings);
});
test('plaintext settings migrate primary and backup on next save', async t => {
  const { dataDir, storage } = await fixture(t);
  const original = { apiKey: 'legacy-secret-123', integrations: { chat: { token: 'legacy-token-456' } } };
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(original));
  await fs.writeFile(path.join(dataDir, 'settings.json.bak'), JSON.stringify(original));
  assert.deepEqual(await storage.readSettings({}), original);
  await storage.writeSettings({ ...original, model: 'new-model' });
  for (const name of ['settings.json', 'settings.json.bak']) {
    const raw = await fs.readFile(path.join(dataDir, name), 'utf8');
    assert.equal(raw.includes('legacy-secret-123'), false);
    assert.equal(raw.includes('legacy-token-456'), false);
  }
  assert.deepEqual(await storage.readSettings({}), { ...original, model: 'new-model' });
});
test('malformed plaintext settings quarantine encrypts secret bytes and returns defaults', async t => {
  const { dataDir, storage } = await fixture(t);
  await fs.writeFile(path.join(dataDir, 'settings.json'), '{"apiKey":"damaged-secret"');
  assert.deepEqual(await storage.readSettings({ provider: 'default' }), { provider: 'default' });
  const files = await fs.readdir(dataDir);
  const quarantined = files.find(name => name.includes('.corrupt-'));
  assert.ok(quarantined);
  assert.equal((await fs.readFile(path.join(dataDir, quarantined), 'utf8')).includes('damaged-secret'), false);
});
test('decoded settings custom validator recovers valid backup', async t=>{
  const {storage}=await fixture(t);
  await storage.writeSettings({model:'valid'});
  await storage.writeSettings({model:42});
  assert.deepEqual(await storage.readSettings({},v=>typeof v.model==='string'),{model:'valid'});
});
test('both invalid settings copies recover to defaults and remain writable', async t => {
  const { dataDir, storage } = await fixture(t);
  await fs.writeFile(path.join(dataDir, 'settings.json'), '{"apiKey":"primary-secret"');
  await fs.writeFile(path.join(dataDir, 'settings.json.bak'), '{"apiKey":"backup-secret"');
  assert.deepEqual(await storage.readSettings({ provider: 'ollama' }), { provider: 'ollama' });
  await storage.writeSettings({ provider: 'ollama', model: 'qwen2.5:3b' });
  const reopened = await createStorage({ dataDir });
  assert.deepEqual(await reopened.readSettings({}), { provider: 'ollama', model: 'qwen2.5:3b' });
  for (const name of await fs.readdir(dataDir)) if (name.includes('.corrupt-')) assert.equal((await fs.readFile(path.join(dataDir, name), 'utf8')).includes('primary-secret') || (await fs.readFile(path.join(dataDir, name), 'utf8')).includes('backup-secret'), false);
});
