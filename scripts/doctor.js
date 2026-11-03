import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const origin = `http://127.0.0.1:${process.env.PORT || 4318}`;
add('Node.js', Number(process.versions.node.split('.')[0]) >= 22, `${process.version}; minimum v22`);
for (const [name, file, guidance] of [
  ['Dependencies', 'node_modules/express/package.json', 'Jalankan npm ci.'],
  ['Build', 'dist/index.html', 'Jalankan npm run build atau Mulai Desktop.cmd.'],
]) {
  try { await fs.access(path.join(root, file)); add(name, true, 'Tersedia'); }
  catch { add(name, false, guidance); }
}
try {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
  const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'));
  add('Credential storage', stored.encryptedSettings === 1 && ['dpapi', 'aes-256-gcm'].includes(stored.algorithm), stored.encryptedSettings === 1 ? stored.algorithm : 'Belum terenkripsi; jalankan launcher untuk migrasi.');
} catch (error) {
  add('Credential storage', error.code === 'ENOENT', error.code === 'ENOENT' ? 'Belum ada pengaturan; dibuat saat pertama menjalankan aplikasi.' : 'Berkas pengaturan tidak dapat dibaca. Periksa log pemulihan.');
}
try {
  const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  const body = await health.json();
  if (!health.ok || body.service !== 'Kantor AI Softklinik Harmes') throw new Error('Port digunakan layanan lain.');
  add('Server', body.ok === true, origin);
  const unauthorized = await fetch(`${origin}/api/state`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  add('Session protection', unauthorized.status === 401, `Tanpa sesi: HTTP ${unauthorized.status}`);
  const session = await fetch(`${origin}/api/session`, { headers: { 'X-Harmes-Bootstrap': '1' }, signal: AbortSignal.timeout(3000), redirect: 'error' });
  const auth = await session.json();
  const cookie = session.headers.get('set-cookie')?.split(';')[0];
  if (!session.ok || !cookie || typeof auth.csrfToken !== 'string') throw new Error('Sesi diagnostik gagal dibuat.');
  const response = await fetch(`${origin}/api/connection/test`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': auth.csrfToken }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  const connection = await response.json();
  add('AI model', response.ok && connection.ok === true, connection.ok ? 'Layanan tersambung; model tersedia. Belum menguji kualitas jawaban.' : connection.message || 'Periksa Pengaturan → Simpan & uji.');
} catch (error) {
  add('Runtime', false, error.message === 'Port digunakan layanan lain.' ? error.message : `Layanan belum siap. Jalankan Mulai Desktop.cmd; periksa Pengaturan dan data/server-error.log. (${error.name})`);
}
const result = { ok: checks.every(check => check.ok), checks };
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else for (const check of checks) console.log(`${check.ok ? 'OK' : 'PERIKSA'} ${check.name}: ${check.detail}`);
process.exitCode = result.ok ? 0 : 1;
