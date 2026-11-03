import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://127.0.0.1:4318';
try {
  const start = spawnSync(process.execPath, [path.join(root, 'scripts', 'start.js'), '--no-browser'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (start.error || start.status !== 0) throw new Error('Kantor AI gagal dimulai. Periksa data/server-error.log.');
  const candidates = [
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  const edge = candidates.find((file) => fs.existsSync(file));
  if (!edge) throw new Error(`Microsoft Edge belum tersedia. Gunakan Mulai Kantor AI.cmd untuk membuka ${url}.`);
  const profile = path.join(root, 'data', 'desktop-profile');
  fs.mkdirSync(profile, { recursive: true });
  const launchUrl = new URL(url);
  launchUrl.searchParams.set('view', process.argv.includes('--3d') ? 'office' : 'dashboard');
  if (process.argv.includes('--3d')) launchUrl.searchParams.set('mode', '3d');
  launchUrl.searchParams.set('build', await fingerprint(root, ['dist']));
  // A versioned URL navigates the dedicated profile to the rebuilt UI.
  const desktop = spawn(edge, [`--app=${launchUrl}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1366,900'], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
  desktop.on('error', (error) => { console.error(`Desktop gagal dibuka: ${error.message}`); process.exitCode = 1; });
  desktop.unref();
  console.log('Kantor AI dibuka dalam jendela desktop.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
