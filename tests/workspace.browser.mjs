// End-to-end React regression checks. All model/Telegram traffic stays on isolated mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(100); }
  throw new Error(`Timed out: ${label}${last ? ': ' + last.message : ''}`);
}
async function port() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value; }
let browserPath;
for (const candidate of [process.env.HQ_BROWSER, `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
  try { await fs.access(candidate); browserPath = candidate; break; } catch {}
}
assert.ok(browserPath, 'Chrome/Edge required; set HQ_BROWSER');
await fs.access(path.join(root, 'dist/index.html'));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kantor-workspace-test-'));
const output = path.join(root, 'data/workspace-validation');
await fs.mkdir(output, { recursive: true });
const apiPort = await port(), debugPort = await port(), token = 'synthetic-browser-test-token';
const origin = `http://127.0.0.1:${apiPort}`;
let backend, browser, socket, sequence = 0, failNextChat = true;
let syntheticDeliveries = 0;
const requests = [], pending = new Map(), exceptions = [];
const mock = http.createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  res.setHeader('content-type', 'application/json');
  if (req.url.endsWith('/getMe')) { res.end(JSON.stringify({ ok: true, result: { id: 123456789, username: 'synthetic_test_bot', first_name: 'Synthetic' } })); return; }
  if (req.url.includes('/getUpdates')) { res.end(JSON.stringify({ ok: true, result: [] })); return; }
  if (req.url.endsWith('/sendMessage')) { syntheticDeliveries++; requests.push(JSON.parse(raw)); res.end(JSON.stringify({ ok: true, result: { message_id: 500 + syntheticDeliveries } })); return; }
  if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'synthetic:1b' }] })); return; }
  if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'synthetic:1b' }] })); return; }
  const body = JSON.parse(raw); requests.push(body);
  const last = body.messages?.at(-1)?.content || '';
  if (last.includes('uji gagal') && failNextChat) { failNextChat = false; res.statusCode = 503; res.end(JSON.stringify({ error: 'Synthetic model unavailable' })); return; }
  if (last.includes('uji markdown aman')) { res.end(JSON.stringify({ message: { content: '![Gambar sintetis](https://example.invalid/private-business-context.png)\n\n[Tautan sintetis](https://example.invalid/review)\n\n[Tautan berbahaya](javascript:alert(1))' } })); return; }
  if (last.includes('tugas lambat')) await delay(5000);
  res.end(JSON.stringify({ message: { content: 'Jawaban sintetis tervalidasi.' } }));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const mockBase = `http://127.0.0.1:${mock.address().port}`;
async function request(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(origin + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); const data = text ? JSON.parse(text) : {};
  assert.ok(response.ok, `${method} ${route}: ${response.status} ${text}`); return data;
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) { const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails)); return response.result.value; }
async function clickText(text, selector = 'button') {
  assert.equal(await evaluate(`(() => { const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => { const copy=e.cloneNode(true); copy.querySelectorAll('em').forEach(n=>n.remove()); return copy.textContent.trim() === ${JSON.stringify(text)}; }); if (!item) return false; item.focus(); item.click(); return true; })()`), true, `button ${text}`);
}
async function fill(selector, value) {
  assert.equal(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`), true, selector);
}
async function submit(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`); }
async function modalClosed() { await until(() => evaluate('!document.querySelector(".modal")'), 'modal closed'); }
async function screenshot(name) { const result = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, name), Buffer.from(result.data, 'base64')); }
try {
  backend = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, DATA_DIR: path.join(temp, 'state'), PORT: String(apiPort), API_TOKEN: token, TELEGRAM_API_BASE_URL: mockBase }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; backend.stderr.on('data', chunk => { errors += chunk; });
  await until(async () => { if (backend.exitCode !== null) throw new Error(errors); return (await fetch(origin + '/api/health')).ok; }, 'isolated backend');
  await request('/api/settings', { provider: 'ollama', baseUrl: mockBase, model: 'synthetic:1b' }, 'PUT');
  await request('/api/integrations', { id: 'synthetic-github', type: 'github', name: 'Synthetic GitHub', baseUrl: 'https://api.github.com', token: 'synthetic-github-secret', scopes: ['read'] });
  const telegram = await request('/api/integrations/telegram/connect', { token: '123456789:synthetic_bot_token_abcdefghijklmnopqrstuvwxyz', name: 'Synthetic Telegram', ownerUserId: '123456789' });
  console.log('Workspace fixtures ready.');
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'browser')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'), 'browser');
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (message.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: origin });
  await until(() => evaluate('!!document.querySelector(".dashboard-hero") && !!document.querySelector(".telegram-nav")'), 'dashboard is the default view');
  await clickText('Kantor animasi', '.sidebar button');
  await until(() => evaluate('document.querySelector("iframe")?.contentWindow?.__officeLite?.metrics().total === 35'), 'office iframe');
  await evaluate('document.querySelector("iframe").contentDocument.querySelector("[data-action=workspace]").click()');
  await until(() => evaluate('!!document.querySelector(".sidebar") && !document.querySelector(".welcome .primary-button")?.disabled'), 'React session and workspace');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('(() => { const button = document.querySelector(".telegram-nav"); const rect = button?.getBoundingClientRect(); return !!rect && rect.top >= 0 && rect.bottom <= innerHeight; })()'), true, 'Telegram visible without sidebar scrolling');
  await screenshot('desktop-dashboard-1366.png');
  await clickText('Telegram', '.sidebar button');
  await until(() => evaluate('document.querySelector(".modal h2")?.textContent === "Kelola Telegram"'), 'direct Telegram entry');
  assert.equal(await evaluate('!!document.querySelector(".connector-tools textarea")'), true, 'Telegram message tools reachable');
  await screenshot('desktop-telegram.png');
  await evaluate('document.querySelector(".modal [aria-label=Tutup]").click()'); await modalClosed();
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'dashboard mobile horizontal overflow');
  await screenshot('mobile-dashboard.png');
  await evaluate('document.querySelector(".mobile-menu").click()');
  assert.equal(await evaluate('document.querySelector(".mobile-menu").getAttribute("aria-expanded")'), 'true', 'mobile menu expanded state');
  assert.equal(await evaluate('document.querySelector(".sidebar").contains(document.activeElement) && document.querySelector("main").inert'), true, 'mobile menu owns keyboard focus');
  await evaluate('(() => { const buttons = document.querySelector(".sidebar").querySelectorAll("button:not(:disabled)"); buttons[buttons.length - 1].focus(); })()');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement === document.querySelector(".sidebar button")'), true, 'Tab wraps inside mobile menu');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(() => evaluate('document.querySelector(".mobile-menu").getAttribute("aria-expanded") === "false" && !document.querySelector("main").inert'), 'mobile menu closes with Escape');
  assert.equal(await evaluate('document.activeElement === document.querySelector(".mobile-menu")'), true, 'mobile menu restores focus');
  await evaluate('document.querySelector(".mobile-menu").click()');
  await clickText('Telegram', '.sidebar button');
  await until(() => evaluate('document.querySelector(".modal h2")?.textContent === "Kelola Telegram"'), 'Telegram from mobile navigation');
  await evaluate('document.querySelector(".modal [aria-label=Tutup]").click()'); await modalClosed();
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  console.log('Workspace dashboard and direct Telegram navigation passed.');

  // Coding Studio uses an isolated project folder and a mocked 9Router. Never launch
  // the real VS Code/Codex processes from this browser regression; intercept those UI actions.
  await clickText('Studio Coding', '.sidebar button');
  await until(() => evaluate('!!document.querySelector(".coding-workspace")'), 'coding studio');
  await until(() => evaluate('!!document.querySelector(".coding-config label:nth-of-type(3) input")?.value'), 'coding initial settings loaded');
  assert.equal(await evaluate('document.querySelector(".coding-tools").textContent.includes("Codex CLI")'), true, 'coding tools visible');
  const codingPath = temp.replaceAll('\\', '/');
  await fill('.coding-config label:nth-of-type(1) input', codingPath);
  await fill('.coding-config label:nth-of-type(2) input', 'synthetic:1b');
  await fill('.coding-config label:nth-of-type(3) input', `${mockBase}/v1`);
  assert.equal(await evaluate('document.querySelector(".coding-run-form .primary-button").disabled'), true, 'coding run disabled until settings saved');
  assert.equal(await evaluate('document.querySelector(".coding-config button.primary-button")?.disabled'), false, 'coding save enabled');
  await submit('.coding-config form');
  await until(async () => (await request('/api/coding')).settings.workspacePath === path.resolve(codingPath), 'coding settings saved');
  await until(() => evaluate('!document.querySelector(".coding-provider-note")?.textContent.includes("Pengaturan berubah")'), 'coding settings settle');
  assert.equal(await evaluate('document.querySelector(".coding-tools").textContent.includes("9Router tersambung")'), true, 'mock 9Router detected');

  // Dirty workspace settings block both launch paths until the employee saves them.
  await fill('.coding-config label:nth-of-type(1) input', path.join(temp, 'missing-folder').replaceAll('\\', '/'));
  assert.equal(await evaluate('document.querySelector(".coding-tools .wide").disabled && document.querySelector(".coding-run-form .primary-button").disabled'), true, 'unsaved coding settings block launch');
  await fill('.coding-config label:nth-of-type(1) input', codingPath);
  await fill('.coding-config label:nth-of-type(2) input', '../invalid-model');
  await submit('.coding-config form');
  await until(() => evaluate('document.querySelector(".coding-alert.error")?.textContent.includes("Model coding tidak valid")'), 'coding model validation error');
  await fill('.coding-config label:nth-of-type(2) input', 'synthetic:1b');
  await fill('.coding-config label:nth-of-type(1) input', 'relative-project');
  await submit('.coding-config form');
  await until(() => evaluate('document.querySelector(".coding-alert.error")?.textContent.includes("path absolut")'), 'coding path validation error');
  await fill('.coding-config label:nth-of-type(1) input', codingPath);
  await fill('.coding-config label:nth-of-type(2) input', 'synthetic:1b');
  await submit('.coding-config form');
  await until(async () => (await request('/api/coding')).settings.workspacePath === path.resolve(codingPath), 'coding settings restored');
  await until(() => evaluate('!document.querySelector(".coding-tools .wide").disabled'), 'coding editor action restored');

  // Handoff remains explicit/manual. Intercept endpoint to avoid opening real VS Code.
  await evaluate(`(() => { window.__codingRealFetch = window.fetch; window.fetch = (input, init) => String(input).includes('/api/coding/open') ? Promise.resolve(new Response(JSON.stringify({ ok: true, handoffPath: ${JSON.stringify(path.join(codingPath, '.kantor-ai/handoff-test.md'))}, workspacePath: ${JSON.stringify(codingPath)} }), { status: 201, headers: { 'content-type': 'application/json' } })) : window.__codingRealFetch(input, init); })()`);
  await until(() => evaluate('!document.querySelector(".coding-tools .wide")?.disabled'), 'coding handoff button enabled');
  await clickText('Buka VSCode', '.coding-tools button');
  await until(() => evaluate('document.querySelector(".coding-handoff")?.textContent.includes("handoff-test.md")'), 'coding manual handoff');
  assert.equal(await evaluate('document.querySelector(".coding-handoff .text-button")?.textContent.includes("Salin path")'), true, 'handoff copy affordance');
  await evaluate('document.querySelector(".coding-handoff .text-button").click()');
  await until(() => evaluate('document.querySelector(".coding-alert")?.textContent.includes("Path handoff disalin") || document.querySelector(".coding-alert")?.textContent.includes("Clipboard tidak tersedia")'), 'handoff copy feedback');
  await evaluate('window.fetch = window.__codingRealFetch');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(250);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'coding mobile horizontal overflow');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  console.log('Coding Studio browser navigation, settings validation, handoff, and mobile layout passed.');

  await clickText('Pengaturan', '.sidebar button');
  await until(() => evaluate('!!document.querySelector(".modal")'), 'settings modal');
  assert.equal(await evaluate('document.querySelector("main").inert && document.body.style.overflow === "hidden"'), true, 'modal background cannot receive focus or scroll');
  await evaluate('(() => { const buttons = document.querySelector(".modal").querySelectorAll("button:not(:disabled)"); buttons[buttons.length - 1].focus(); })()');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate('document.activeElement === document.querySelector(".modal button")'), true, 'Tab wraps inside modal');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await modalClosed();
  assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Pengaturan', 'focus restored');
  assert.equal(await evaluate('!document.querySelector("main").inert && document.body.style.overflow !== "hidden"'), true, 'modal restores background');
  console.log('Workspace session and modal focus passed.');

  await clickText('Integrasi akun', '.sidebar button');
  await until(() => evaluate('!!document.querySelector(".integration-grid")'), 'integration list');
  await evaluate('[...document.querySelectorAll(".integration-card")].find(e => e.textContent.includes("Synthetic GitHub")).querySelector("button").click()');
  await fill('.modal form input:not([type=password])', 'Synthetic GitHub renamed'); await submit('.modal form');
  await until(async () => (await request('/api/integrations')).connectors.find(item => item.id === 'synthetic-github')?.name === 'Synthetic GitHub renamed', 'connector saved in place');
  const connectors = (await request('/api/integrations')).connectors;
  assert.equal(connectors.filter(item => item.type === 'github').length, 1); assert.equal(connectors.find(item => item.id === 'synthetic-github').connected, true);
  await until(() => evaluate('!!document.querySelector(".integration-grid")'), 'integration list after save');
  await evaluate('[...document.querySelectorAll(".integration-card")].find(e => e.textContent.includes("Synthetic GitHub renamed")).querySelector("button").click()');
  await clickText('Hapus koneksi');
  await until(async () => !(await request('/api/integrations')).connectors.some(item => item.id === 'synthetic-github'), 'connector deleted');
  console.log('Workspace connector edit/delete passed.');
  await until(() => evaluate('!!document.querySelector(".integration-grid")'), 'integration list after delete');
  await evaluate('[...document.querySelectorAll(".integration-card")].find(e => e.textContent.includes("Synthetic Telegram")).querySelector("button").click()');
  await fill('.connector-tools input', '123456789'); await fill('.connector-tools textarea', 'Pesan sintetis untuk pengujian.'); await clickText('Tinjau sebelum kirim');
  await until(() => evaluate('!!document.querySelector(".action-preview")'), 'Telegram preview');
  assert.equal(syntheticDeliveries, 0, 'preview does not send');
  await clickText('Setujui & kirim pesan');
  await until(() => syntheticDeliveries === 1, 'approved Telegram delivery');
  await until(() => evaluate('!document.querySelector(".action-preview")'), 'preview consumed');
  assert.equal(requests.find(item => item.chat_id)?.text, 'Pesan sintetis untuk pengujian.');
  console.log('Workspace Telegram preview/approval passed.');
  await evaluate('document.querySelector(".modal [aria-label=Tutup]").click()'); await modalClosed();

  await clickText('Basis pengetahuan', '.sidebar button');
  assert.equal(await evaluate('!document.querySelector(".document-upload input").hidden && document.querySelector(".document-upload input").tabIndex === 0'), true, 'document upload keyboard accessible');
  await fill('.document-form input', 'FAQ sintetis'); await fill('.document-form textarea', 'Jadwal klinik sintetis tersedia setiap Senin.'); await submit('.document-form');
  await until(() => evaluate('document.querySelectorAll(".document-row").length === 1'), 'pasted document saved');
  const upload = path.join(temp, 'upload.md'); await fs.writeFile(upload, 'Prosedur onboarding sintetis menggunakan kode VIOLET.');
  const documentNode = await cdp('DOM.getDocument');
  const fileNode = await cdp('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: 'input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [upload] });
  await until(() => evaluate('document.querySelector(".document-form input").value === "upload.md"'), 'file loaded'); await submit('.document-form');
  await until(() => evaluate('document.querySelectorAll(".document-row").length === 2'), 'uploaded document saved');
  await evaluate('document.querySelector(".document-row button").click()');
  await until(() => evaluate('document.querySelectorAll(".document-row").length === 1'), 'document deleted');
  await screenshot('desktop-documents.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(250);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'knowledge mobile horizontal overflow');
  await screenshot('mobile-documents.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  console.log('Workspace document paste/upload/delete passed.');

  await clickText('Dashboard', '.sidebar button');
  await screenshot('desktop-dashboard.png');
  await fill('.chat-input', 'uji gagal sekali lalu pulih'); await submit('.chat-input-wrap');
  await until(() => evaluate('document.querySelector(".chat-input").value === "uji gagal sekali lalu pulih" && !document.querySelector(".chat-input").disabled'), 'failed chat draft restored');
  assert.equal((await request('/api/state')).messages.length, 0, 'failed chat rolled back');
  await submit('.chat-input-wrap');
  await until(() => evaluate('document.querySelectorAll(".message.assistant").length === 1'), 'chat retry');
  const chatState = await request('/api/state'); assert.equal(chatState.messages.filter(item => item.role === 'user').length, 1);
  await clickText('Hapus chat'); await until(() => evaluate('!document.querySelector(".message")'), 'chat cleared');
  await fill('.chat-input', 'uji markdown aman'); await submit('.chat-input-wrap');
  await until(() => evaluate('!!document.querySelector(".markdown-image-link")'), 'safe Markdown rendered');
  assert.equal(await evaluate('document.querySelectorAll(".markdown img").length'), 0, 'Markdown images cannot make automatic tracking requests');
  assert.equal(await evaluate('[...document.querySelectorAll(".markdown a")].every(a => a.target === "_blank" && a.rel.includes("noopener") && a.rel.includes("noreferrer") && !a.href.startsWith("javascript:"))'), true, 'Markdown links isolated with no referrer');
  assert.equal(await evaluate('document.querySelector(".markdown-image-link a").textContent'), 'Buka gambar: Gambar sintetis', 'blocked images remain explicitly accessible');
  await clickText('Hapus chat'); await until(() => evaluate('!document.querySelector(".message")'), 'safe Markdown chat cleared');
  console.log('Workspace chat failure/retry passed.');

  const { task } = await request('/api/tasks', { title: 'tugas lambat untuk pembatalan', agentId: 'admin' });
  await clickText('Tugas', '.sidebar button');
  await until(() => evaluate('!!document.querySelector(".task-row")'), 'task visible'); await evaluate('document.querySelector(".task-row").click()');
  await clickText('Batalkan tugas');
  await until(() => evaluate('document.querySelector(".status-pill")?.textContent === "Dibatalkan"'), 'task cancelled');
  await clickText('Coba lagi');
  await until(() => evaluate('document.querySelector(".status-pill")?.textContent === "Selesai"'), 'task retry complete');
  assert.equal((await request('/api/state')).tasks.find(item => item.id === task.id)?.status, 'completed');
  await clickText('Hapus tugas'); await modalClosed();
  await until(() => evaluate('!document.querySelector(".task-row")'), 'task deleted');
  await clickText('Buat tugas', '.welcome button');
  await fill('.modal input[required]', 'Tugas terjadwal sintetis');
  const future = new Date(Date.now() + 5 * 60000);
  const localSchedule = new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await fill('.modal input[type=datetime-local]', localSchedule);
  await submit('.modal form');
  await until(() => evaluate('document.querySelector(".modal h2")?.textContent === "Tugas terjadwal sintetis"'), 'scheduled task saved');
  const scheduled = (await request('/api/state')).tasks.find(item => item.title === 'Tugas terjadwal sintetis');
  assert.ok(Date.parse(scheduled.scheduledAt) > Date.now()); assert.equal(scheduled.status, 'queued');
  await clickText('Batalkan tugas'); await until(() => evaluate('document.querySelector(".status-pill")?.textContent === "Dibatalkan"'), 'scheduled task cancelled');
  await clickText('Hapus tugas'); await modalClosed();
  const backup = await request('/api/backup'); assert.equal(backup.settings, undefined); assert.equal(backup.integrations, undefined);
  assert.ok(!JSON.stringify(backup).includes('synthetic-github-secret'));
  const restoreFile = path.join(temp, 'workspace-backup.json'); await fs.writeFile(restoreFile, JSON.stringify(backup));
  const savedDocuments = (await request('/api/documents')).documents;
  await request(`/api/documents/${savedDocuments[0].id}`, undefined, 'DELETE');
  await clickText('Pengaturan', '.sidebar button');
  const restoreRoot = await cdp('DOM.getDocument');
  const restoreInput = await cdp('DOM.querySelector', { nodeId: restoreRoot.root.nodeId, selector: '.modal input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId: restoreInput.nodeId, files: [restoreFile] });
  await until(() => evaluate('document.querySelector(".settings-message")?.textContent === "Cadangan berhasil dipulihkan."'), 'backup restored');
  assert.equal((await request('/api/documents')).documents.length, savedDocuments.length);
  assert.equal((await request('/api/settings')).model, 'synthetic:1b', 'restore preserves provider settings');
  assert.equal((await request('/api/integrations')).connectors.find(item => item.id === telegram.connector.id)?.connected, true);
  assert.deepEqual(exceptions, [], 'no unhandled browser exceptions');
  console.log('Workspace browser passed: session, iframe, modal focus, documents paste/upload/delete, chat failure/retry, task schedule/cancel/retry/delete, connector edit/delete, Telegram preview/approval, backup restore.');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  socket?.close(); browser?.kill(); backend?.kill();
  for (const child of [browser, backend]) if (child && child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  const resolved = path.resolve(temp); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('kantor-workspace-test-'));
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

