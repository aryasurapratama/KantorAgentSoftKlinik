import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const root = process.cwd();
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
const wait = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Benchmark server timeout.'); };
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))];
const rounds = Math.max(1, Math.min(20, Number.parseInt(process.env.BENCHMARK_ROUNDS || '3', 10) || 3));
let providerCalls = 0;
const provider = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  res.setHeader('content-type', 'application/json');
  if (req.url === '/models') return res.end(JSON.stringify({ data: [{ id: 'benchmark-model' }] }));
  if (req.url === '/chat/completions') { providerCalls++; return res.end(JSON.stringify({ model: 'benchmark-model', choices: [{ message: { content: 'Respons benchmark.' } }], usage: { prompt_tokens: 20, completion_tokens: 8 } })); }
  res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' }));
});
const providerPort = await listen(provider);
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'harmes-router-benchmark-'));
const port = providerPort + 1;
const child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, STORAGE_BACKEND: 'json', AI_ALLOW_LOCAL_COMPATIBLE: '1', API_TOKEN: '', DISABLE_FAST_ROUTER: process.env.DISABLE_FAST_ROUTER || '' } });
const base = `http://127.0.0.1:${port}`;
try {
  await wait(async () => (await fetch(`${base}/api/health`)).ok);
  const session = await fetch(`${base}/api/session`, { headers: { 'x-harmes-bootstrap': '1' } });
  const sessionBody = await session.json();
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const headers = { 'content-type': 'application/json', cookie, 'x-csrf-token': sessionBody.csrfToken };
  await fetch(`${base}/api/settings`, { method: 'PUT', headers, body: JSON.stringify({ provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${providerPort}`, model: 'benchmark-model', businessName: 'Benchmark' }) });
  const inputs = [['ping', 'ping'], ['halo', 'halo'], ['percakapan biasa', 'Jelaskan cara kerja cache.'], ['meeting', 'Siapkan agenda meeting.'], ['coding kompleks', 'Debug API TypeScript dan jalankan test.']];
  const report = {};
  for (const [name, message] of inputs) {
    const samples = [];
    for (let i = 0; i < rounds; i++) { const started = performance.now(); const response = await fetch(`${base}/api/chat`, { method: 'POST', headers, body: JSON.stringify({ agentId: 'admin', message }) }); if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`); await response.arrayBuffer(); samples.push(performance.now() - started); }
    report[name] = { rounds, p50Ms: Number(percentile(samples, .5).toFixed(2)), p95Ms: Number(percentile(samples, .95).toFixed(2)), maxMs: Number(Math.max(...samples).toFixed(2)) };
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), fastRouter: process.env.DISABLE_FAST_ROUTER !== '1', providerCalls, report }, null, 2));
} finally {
  child.kill(); provider.close(); await rm(dataDir, { recursive: true, force: true });
}
