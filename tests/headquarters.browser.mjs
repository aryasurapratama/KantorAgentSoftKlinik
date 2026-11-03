// Real Chromium smoke test; no npm browser dependencies. Run npm run build first.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch {} await delay(150); }
  throw Error(`Timed out: ${label}`);
}
async function port() { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const p = server.address().port; await new Promise(r => server.close(r)); return p; }
const candidates = [process.env.HQ_BROWSER, `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let browserPath;
for (const candidate of candidates) { try { await fs.access(candidate); browserPath = candidate; break; } catch {} }
assert.ok(browserPath, 'Chrome/Edge required; set HQ_BROWSER to executable path');
await fs.access(path.join(root, 'dist/index.html')).catch(() => { throw Error('Run npm run build before npm run test:hq'); });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kantor-hq-validation-'));
const output = path.join(root, 'data/hq-validation');
await fs.mkdir(output, { recursive: true });
let server, browser, socket;
const pending = new Map(), errors = [];
let sequence = 0;
async function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function click(selector) { assert.equal(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true})()`), true, selector); }
async function choose(id) { await evaluate(`(()=>{const e=document.querySelector('#roomSelector');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change'));})()`); }
async function screenshot(name) { const shot = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, name), Buffer.from(shot.data, 'base64')); }
try {
  const apiPort = await port(), debugPort = await port();
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(apiPort), DATA_DIR: path.join(temp, 'state') }, windowsHide: true, stdio: 'ignore' });
  const origin = `http://127.0.0.1:${apiPort}`;
  await until(async () => (await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok, 'isolated server');
  await until(async () => (await fetch(`${origin}/office/index.html`)).ok, 'production office');
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'browser')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const targets = await until(async () => { const a = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); return a.find(x => x.type === 'page'); }, 'browser CDP');
  socket = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (!p) return; clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  // Test the same 3D document directly; the React shell already validates iframe messaging.
  await cdp('Page.navigate', { url: `${origin}/office/index.html` });
  await until(() => evaluate('document.readyState === "complete"'), 'headquarters document loaded');
  await until(() => evaluate('!!window.__kantor'), 'headquarters ready', 90000);
  await until(async () => (await evaluate('__kantor.stats().frames')) > 2, 'rendered frames');
  await until(async () => (await evaluate("document.querySelector('#status')?.textContent || ''")).startsWith('Terhubung'), 'headquarters connected');
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  await fs.rm(path.join(output, 'kantor-harmes.png'), { force: true });
  await click('#exportPng');
  const exported = await until(async () => { const png = await fs.readFile(path.join(output, 'kantor-harmes.png')); return png.length > 1024 && png; }, 'PNG export');
  assert.equal(exported.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'valid PNG signature');
  assert.ok(exported.readUInt32BE(16) > 0 && exported.readUInt32BE(20) > 0, 'PNG image dimensions');
  const stats = await evaluate('__kantor.stats()'), rooms = await evaluate('__kantor.rooms()'), spaces = await evaluate('__kantor.spaces()');
  assert.equal(stats.staff, 35); assert.equal(stats.onstage, 35); assert.equal(rooms.length, 8);
  const team = JSON.parse(await fs.readFile(path.join(root, 'public/team.json'), 'utf8'));
  const departmentIds = team.departments.map(d => d.id);
  assert.deepEqual(rooms.map(r => r.id), departmentIds, 'one room per configured division');
  assert.deepEqual(spaces.map(s => s.id), departmentIds, 'only divisions are navigable');
  assert.deepEqual(await evaluate('[...document.querySelector("#roomSelector").options].map(o=>o.value)'), ['all', ...departmentIds], 'division selector matches roster');
  assert.equal(await evaluate('document.querySelector("#roomCount").textContent'), '8 divisi · 35 agen');
  const actors = await evaluate('__kantor.actors()');
  assert.equal(new Set(actors.map(a => a.id)).size, 35);
  for (const member of team.members) {
    const room = rooms.find(r => r.id === member.departmentId), actor = actors.find(a => a.id === member.id);
    assert.ok(room.members.includes(member.id), `${member.id} assigned to own division`);
    assert.ok(Math.abs(actor.home.x - room.x) < room.width / 2 && Math.abs(actor.home.z - room.z) < room.depth / 2, `${member.id} workstation inside division`);
  }
  const building = await evaluate('__kantor.building()');
  assert.ok(building, 'building fit diagnostics');
  assert.ok(building.bounds.maxX - building.bounds.minX < 90, 'compact office width');
  assert.ok(building.bounds.maxZ - building.bounds.minZ < 85, 'compact office depth');
  assert.equal(building.projectedCorners.length, 8);
  for (const corner of building.projectedCorners) {
    assert.ok(corner.x >= -1 && corner.x <= building.viewport.width + 1 && corner.y >= building.viewport.top - 1 && corner.y <= building.viewport.top + building.viewport.height + 1 && Math.abs(corner.z) <= 1, 'whole building fits viewport');
  }
  await screenshot('desktop-overview.png');
  await choose(rooms[0].id);
  assert.equal(await evaluate('__kantor.stats().room'), rooms[0].id);
  assert.equal(await evaluate('document.querySelector("#spaceInfo").hidden'), false);
  await screenshot('desktop-room.png');
  await click('#labelsToggle'); await delay(250);
  assert.equal(await evaluate('document.querySelector("#labelsToggle").getAttribute("aria-pressed")'), 'false');
  assert.equal(await evaluate('[...document.querySelectorAll(".room-label")].every(e=>e.hidden)'), true);
  await click('#labelsToggle'); await click('#pause'); assert.equal(await evaluate('__kantor.stats().paused'), true); await click('#pause');
  for (const room of rooms) { await choose(room.id); assert.equal(await evaluate('[...document.querySelectorAll(".person")].filter(e=>!e.hidden).length'), room.members.length, room.id); }
  await click('#overview'); assert.equal(await evaluate('[...document.querySelectorAll(".person")].filter(e=>!e.hidden).length'), 35);
  await choose(rooms[0].id); await click('#resetView');
  assert.equal(await evaluate('__kantor.stats().room'), 'all');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'t'}))");
  assert.equal(await evaluate("document.querySelector('#topView').getAttribute('aria-pressed')"), 'true');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Home'}))");
  assert.equal(await evaluate("document.querySelector('#topView').getAttribute('aria-pressed')"), 'false');
  assert.equal(await evaluate('__kantor.stats().room'), 'all');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'l'}))");
  assert.equal(await evaluate("document.querySelector('#labelsToggle').getAttribute('aria-pressed')"), 'false');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'l'}))");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}))");
  assert.equal(await evaluate('__kantor.stats().paused'), true);
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}))");
  await evaluate("document.querySelector('#quality').selectedIndex=1;document.querySelector('#quality').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate('__kantor.stats().frameCap'), 20);
  assert.equal(await evaluate('__kantor.stats().shadows'), true);
  await evaluate("document.querySelector('#quality').selectedIndex=0;document.querySelector('#quality').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate('__kantor.stats().frameCap'), 10);
  assert.equal(await evaluate('__kantor.stats().shadows'), false);
  await evaluate("(()=>{const search=document.querySelector('#search');search.focus();search.value='t';search.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}));})()");
  assert.equal(await evaluate("document.querySelector('#topView').getAttribute('aria-pressed')"), 'false', 'typing does not trigger camera shortcut');
  await evaluate("document.querySelector('#search').value='';document.querySelector('#search').blur()");
  assert.ok(await evaluate('document.querySelector("[data-action=lite]")'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.reload', { ignoreCache: true });
  await until(() => evaluate('document.readyState === "complete"'), 'mobile document loaded');
  await until(() => evaluate('!!window.__kantor'), 'mobile headquarters ready', 90000);
  await delay(400); await screenshot('mobile-overview.png');
  assert.equal(await evaluate('innerWidth'), 390, 'actual mobile CSS viewport');
  assert.ok(await evaluate('[...document.querySelectorAll("header button,header select,header input,#architectureControls button,nav button")].every(e=>e.getBoundingClientRect().height>=40)'), 'mobile touch targets');
  await click('#peopleToggle');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#architectureControls")).display'), 'none', 'directory avoids architecture controls');
  await click('#peopleToggle');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'mobile horizontal overflow');
  // Old links must never resurrect the extra HQ suites.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${origin}/office/headquarters.html?room=ceo` });
  await until(() => evaluate('location.pathname === "/office/headquarters.html" && document.readyState === "complete" && !!window.__kantor'), 'legacy headquarters ready', 90000);
  await until(async () => (await evaluate('__kantor.stats().frames')) > 2, 'legacy rendered frames');
  const legacyStats = await evaluate('__kantor.stats()'), legacySpaces = await evaluate('__kantor.spaces()');
  assert.equal(legacyStats.staff, 35);
  assert.equal(legacyStats.onstage, 35);
  assert.equal(legacyStats.room, 'all', 'removed facilities fall back to overview');
  assert.deepEqual(legacySpaces.map(s => s.id), departmentIds, 'legacy HQ exposes only configured divisions');
  assert.deepEqual(await evaluate('[...document.querySelector("#roomSelector").options].map(o=>o.value)'), ['all', ...departmentIds]);
  assert.equal(await evaluate('document.querySelector("#roomCount").textContent'), '8 divisi · 35 agen');
  assert.equal(await evaluate('document.querySelectorAll(".zone-label").length'), 0, 'removed zones have no labels');
  const legacyBuilding = await evaluate('__kantor.building()');
  assert.deepEqual(legacyBuilding.bounds, building.bounds, 'legacy URL uses the same geometry');
  await screenshot('legacy-desktop-overview.png');
  await choose(legacySpaces[0].id);
  assert.equal(await evaluate('__kantor.stats().room'), legacySpaces[0].id);
  await click('#topView');
  assert.equal(await evaluate('document.querySelector("#topView").getAttribute("aria-pressed")'), 'true');
  await click('#resetView');
  assert.equal(await evaluate('__kantor.stats().room'), 'all');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.reload', { ignoreCache: true });
  await until(() => evaluate('document.readyState === "complete" && !!window.__kantor'), 'legacy mobile ready', 90000);
  await delay(400); await screenshot('legacy-mobile-overview.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'legacy mobile horizontal overflow');
  // React shell smoke: authenticated workspace bootstrap, task form, integrations modal.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${origin}/?view=office&mode=3d` });
  await until(() => evaluate('document.querySelector("iframe")?.contentDocument?.location.pathname === "/office/index.html" && !!document.querySelector("iframe")?.contentWindow?.__kantor'), 'workspace uses compact 3D');
  assert.deepEqual(await evaluate('document.querySelector("iframe").contentWindow.__kantor.spaces().map(s=>s.id)'), departmentIds, 'desktop 3D uses exactly the roster divisions');
  await cdp('Page.navigate', { url: `${origin}/?view=office&mode=lite` });
  await until(() => evaluate('location.pathname === "/" && document.readyState === "complete"'), 'workspace document loaded');
  await until(() => evaluate("document.querySelector('iframe')?.contentDocument?.location.pathname === '/office-lite/index.html' && !!document.querySelector('iframe')?.contentDocument?.querySelector('[data-action=workspace]')"), 'workspace bridge ready');
  await until(async () => (await evaluate("document.querySelector('iframe')?.contentDocument?.querySelector('#live')?.textContent || ''")).includes('Terhubung'), 'lite document connected');
  await evaluate("document.querySelector('iframe').contentDocument.querySelector('[data-action=workspace]').click()");
  await until(() => evaluate("document.querySelector('.primary-button')?.textContent.includes('Buat tugas')"), 'workspace dashboard');
  await click('.primary-button');
  await until(() => evaluate("document.querySelector('[role=dialog]')?.getAttribute('aria-label') === 'Delegasikan pekerjaan'"), 'task form');
  assert.ok(await evaluate("!!document.querySelector('[role=dialog] input[required]')"));
  assert.equal(await evaluate("document.querySelector('[role=dialog] button[type=submit]').disabled"), true, 'empty task cannot submit');
  await click('[role=dialog] .icon-button');
  await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Integrasi akun'))?.click()");
  await until(() => evaluate("document.querySelector('[role=dialog]')?.getAttribute('aria-label') === 'Integrasi akun & web'"), 'integrations modal');
  assert.ok(await evaluate("!!document.querySelector('[role=dialog] .integration-grid')"));
  await click('[role=dialog] .icon-button');
  assert.deepEqual(errors, [], 'fatal browser errors');
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ stats, rooms: rooms.length, spaces: spaces.length, legacySpaces: legacySpaces.length, legacyStats, building, errors }, null, 2));
  console.log(`HQ browser validation passed: 35 agents, 8 departments, ${spaces.length} spaces, ${legacySpaces.length} legacy spaces. Screenshots: ${output}`);
} finally {
  socket?.close(); browser?.kill(); server?.kill();
  for (const child of [browser, server]) if (child && child.exitCode === null) await Promise.race([new Promise(r => child.once('exit', r)), delay(5000)]);
  const resolved = path.resolve(temp), base = path.resolve(os.tmpdir());
  assert.ok(path.dirname(resolved) === base && path.basename(resolved).startsWith('kantor-hq-validation-'), 'confined temporary cleanup');
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
