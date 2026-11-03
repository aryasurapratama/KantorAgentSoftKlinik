import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint, stopOwnedServer, acquireLauncherLock } from './runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const url = 'http://127.0.0.1:4318';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function health() {
  try { return await (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) })).json(); }
  catch { return null; }
}
function runNpm(command) {
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${command}`], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`npm ${command} gagal. Periksa koneksi dan pesan di atas.`);
}
async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const release = await acquireLauncherLock(root);
  try {
  if (process.argv.includes('--stop')) {
    const current = await health();
    const stopped = await stopOwnedServer(root, dataDir);
    if (current && !stopped) throw new Error('Server berjalan di luar peluncur ini. Tutup proses server secara manual.');
    console.log('Server Kantor AI berhenti.');
    return;
  }
  if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) runNpm('ci');
  const frontendId = await fingerprint(root, ['src', 'public', 'index.html', 'vite.config.js', 'package-lock.json']);
  const marker = path.join(root, 'dist', '.source-fingerprint');
  let previousId = ''; try { previousId = fs.readFileSync(marker, 'utf8'); } catch {}
  if (!fs.existsSync(path.join(root, 'dist', 'index.html')) || frontendId !== previousId) {
    runNpm('run build'); fs.writeFileSync(marker, frontendId);
  }
  const buildId = await fingerprint(root, ['server.js', 'office-state.js', 'api-security.js', 'storage.js', 'workspace-features.js', 'workspace-routes.js', 'web-ingestion.js', 'knowledge-base.js', 'office-workflow.js', 'self-development-engine.js', 'self-development-routes.js', 'coding-task-runner.js', 'coding-workspace.js', 'coding-routes.js', 'telegram-command-center.js', 'telegram-conversation.js', 'fast-router.js', 'scripts/coding.js', 'package-lock.json', 'src', 'public']);
  const log = fs.openSync(path.join(dataDir, 'server.log'), 'a');
  const errorLog = fs.openSync(path.join(dataDir, 'server-error.log'), 'a');
  let ollamaReady = false;
  try { ollamaReady = (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) })).ok; } catch {}
  const ollamaExe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  if (!ollamaReady && fs.existsSync(ollamaExe)) {
    const ollama = spawn(ollamaExe, ['serve'], { detached: true, windowsHide: true, cwd: root, stdio: 'ignore' });
    ollama.on('error', (error) => console.error('Ollama:', error.message));
    ollama.unref();
  }
  let current = await health();
  if (current && current.service !== 'Kantor AI Softklinik Harmes') throw new Error('Port 4318 digunakan aplikasi lain. Tutup aplikasi tersebut lebih dahulu.');
  if (current && (current.buildId !== buildId || process.argv.includes('--restart'))) {
    if (!await stopOwnedServer(root, dataDir)) throw new Error('Server versi lama masih berjalan di luar peluncur ini. Tutup proses server lalu buka lagi.');
    current = null;
  }
  if (!current) {
    const server = spawn(process.execPath, [path.join(root, 'server.js')], { detached: true, windowsHide: true, cwd: root, env: { ...process.env, PORT: '4318', HARMES_BUILD_ID: buildId }, stdio: ['ignore', log, errorLog] });
    server.on('error', (error) => console.error('Server:', error.message));
    fs.writeFileSync(path.join(dataDir, 'server.pid'), String(server.pid));
    server.unref();
    for (let attempt = 0; attempt < 30; attempt++) {
      await wait(500); current = await health();
      if (current?.service === 'Kantor AI Softklinik Harmes') break;
    }
  }
  fs.closeSync(log); fs.closeSync(errorLog);
  if (current?.service !== 'Kantor AI Softklinik Harmes') throw new Error('Server gagal dimulai. Periksa data/server-error.log.');
  console.log(`Kantor AI Softklinik Harmes siap: ${url}`);
  if (!process.argv.includes('--no-browser')) {
    const browser = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`], { detached: true, windowsHide: true, stdio: 'ignore' });
    browser.unref();
  }
  } finally { await release(); }
}
try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
