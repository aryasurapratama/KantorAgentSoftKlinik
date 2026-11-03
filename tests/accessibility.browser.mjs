// Automated WCAG checks complement the keyboard, focus, and mobile regressions.
// Isolated data/model fixtures; no real credentials or third-party requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import axe from 'axe-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(100); }
  throw new Error(`${label}: timeout${last ? ` (${last.message})` : ''}`);
}
async function port() {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const result = probe.address().port; await new Promise(resolve => probe.close(resolve)); return result;
}
let browserPath;
for (const candidate of [process.env.HQ_BROWSER, `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
  try { await fs.access(candidate); browserPath = candidate; break; } catch {}
}
assert.ok(browserPath, 'Chrome/Edge required; set HQ_BROWSER');
await fs.access(path.join(root, 'dist/index.html'));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kantor-a11y-'));
const output = path.join(root, 'data/accessibility-validation');
await fs.mkdir(output, { recursive: true });
const apiPort = await port(), debugPort = await port();
const origin = `http://127.0.0.1:${apiPort}`, token = 'synthetic-a11y-token';
const mock = http.createServer((req, res) => {
  req.resume(); res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ models: [{ name: 'synthetic:1b' }] }));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
let backend, browser, socket, sequence = 0;
const pending = new Map(), reports = [];
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
}
async function audit(name) {
  await evaluate(axe.source);
  const result = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] }, resultTypes: ['violations','incomplete'], iframes: false }).then(r => ({ violations: r.violations.map(v => ({ id:v.id, impact:v.impact, description:v.description, helpUrl:v.helpUrl, nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})) })), incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})) }))`);
  const width = await evaluate('innerWidth');
  const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth');
  reports.push({ name, width, overflow, ...result });
  if (result.violations.length || overflow) {
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.error(`${name}: ${JSON.stringify({ overflow, violations: result.violations })}`);
  } else console.log(`Accessibility passed: ${name}`);
}
async function navigate(view) {
  await cdp('Page.navigate', { url: `${origin}/?view=${view}` });
  await until(() => evaluate(`document.readyState==='complete' && !!document.querySelector('.sidebar') && !!document.querySelector('.workspace-heading h1') && !document.querySelector('.loading')`), view);
  await delay(200);
}
async function open(label, selector = '.sidebar button') {
  assert.equal(await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(label)}); if(!e)return false; e.click(); return true; })()`), true, label);
  await until(() => evaluate('!!document.querySelector(".modal")'), `${label} dialog`);
}
try {
  backend = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(apiPort), DATA_DIR: path.join(temp, 'state'), API_TOKEN: token }, windowsHide: true, stdio: 'ignore' });
  await until(async () => (await fetch(`${origin}/api/health`)).ok, 'server');
  const settings = await fetch(`${origin}/api/settings`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'ollama', baseUrl: `http://127.0.0.1:${mock.address().port}`, model: 'synthetic:1b' }) });
  assert.equal(settings.status, 200);
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'browser')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'), 'browser');
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data), item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  for (const [width, label] of [[1440, 'desktop'], [390, 'mobile'], [320, 'narrow']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    for (const view of ['dashboard', 'tasks', 'team', 'insights', 'knowledge', 'coding', 'projects']) {
      await navigate(view); await audit(`${label}-${view}`);
    }
    await navigate('dashboard'); await open('Pengaturan'); await audit(`${label}-settings`);
    await evaluate('document.querySelector(".modal [aria-label=Tutup]").click()');
    await until(() => evaluate('!document.querySelector(".modal")'), 'settings closed');
    await open('Integrasi akun'); await audit(`${label}-integrations`);
    await evaluate('document.querySelector(".modal [aria-label=Tutup]").click()');
    await until(() => evaluate('!document.querySelector(".modal")'), 'integrations closed');
    await open('Buat tugas', '.welcome button'); await audit(`${label}-new-task`);
  }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ engine: axe.version, reports }, null, 2));
  assert.ok(reports.every(report => !report.violations.length && !report.overflow), 'Accessibility violations; see data/accessibility-validation/report.json');
  console.log(`Accessibility checks passed: ${reports.length} page/viewport combinations. Manual assistive technology review remains necessary.`);
} finally {
  socket?.close(); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Browser closed')); }
  browser?.kill(); backend?.kill();
  for (const child of [browser, backend]) if (child && child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  const resolved = path.resolve(temp); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('kantor-a11y-'));
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
