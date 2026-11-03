import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const wait = async (fn, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 40)); } throw new Error('timeout'); };
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });

test('operations API persists a model-backed website workflow and approval', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harmes-operations-'));
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {}; const prompt = body.messages?.at(-1)?.content || '';
    let content = 'Kontribusi model uji: fakta, risiko, keputusan, verifikasi.';
    if (prompt.includes('Buat website statis nyata')) content = JSON.stringify({ html: '<!doctype html><html><head><title>Klinik</title><link href="style.css" rel="stylesheet"></head><body>Klinik</body><script src="app.js"></script></html>', css: 'body{font-family:sans-serif}', js: 'document.title="Klinik"' });
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ model: 'test-model', choices: [{ message: { content } }] }));
  });
  const providerPort = await listen(provider); const spare = http.createServer(); const appPort = await listen(spare); await new Promise(resolve => spare.close(resolve));
  const app = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(appPort), DATA_DIR: dataDir, AI_ALLOW_LOCAL_COMPATIBLE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cookie = '', csrf = '';
  const call = async (route, options = {}) => { const headers = { ...(options.body ? {'content-type': 'application/json'} : {}), ...(cookie ? { cookie, 'x-csrf-token': csrf } : {}), ...(options.headers || {}) }; const response = await fetch(`http://127.0.0.1:${appPort}/api/${route}`, { ...options, headers }); const raw = await response.text(); let body; try { body = raw ? JSON.parse(raw) : {}; } catch { body = raw; } return { status: response.status, body }; };
  try {
    await wait(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok; } catch { return false; } });
    const session = await call('session', { headers: { 'x-harmes-bootstrap': '1' } }); assert.equal(session.status, 200); csrf = session.body.csrfToken;
    const setCookie = await fetch(`http://127.0.0.1:${appPort}/api/session`, { headers: { 'x-harmes-bootstrap': '1' } }); cookie = setCookie.headers.get('set-cookie').split(';')[0]; csrf = (await setCookie.json()).csrfToken;
    assert.equal((await call('settings', { method: 'PUT', body: JSON.stringify({ provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${providerPort}/v1`, model: 'test-model' }) })).status, 200);
    const created = await call('operations/projects', { method: 'POST', body: JSON.stringify({ instruction: 'Buat website klinik kesehatan', requestId: 'ops-api-test-001' }) }); assert.equal(created.status, 202); const id = created.body.project.id;
    const finished = await wait(async () => { const current = (await call('operations')).body; const project = current.projects.find(p => p.id === id); return ['waiting_approval', 'failed'].includes(project?.status) ? { current, project } : null; });
    assert.equal(finished.project.status, 'waiting_approval', finished.project.error); assert.ok(finished.current.meetings[0].transcript.length >= 5); assert.ok(finished.project.artifacts.some(a => a.name === 'index.html'));
    const artifact = finished.project.artifacts.find(a => a.name === 'index.html'); const downloaded = await call(`operations/projects/${id}/artifacts/${artifact.id}`, { method: 'GET' }); assert.equal(downloaded.status, 200); assert.match(downloaded.body, /<title>Klinik/);
    const approved = await call(`operations/projects/${id}/approve`, { method: 'POST', body: '{}' }); assert.equal(approved.status, 200); assert.equal(approved.body.project.status, 'completed');
    assert.equal((await call('operations/projects', { method: 'POST', body: JSON.stringify({ instruction: 'Buat website klinik kesehatan', requestId: 'ops-api-test-001' }) })).body.project.id, id);
  } finally { app.kill(); await new Promise(resolve => app.once('exit', resolve)); provider.close(); await fs.rm(dataDir, { recursive: true, force: true }); }
});
