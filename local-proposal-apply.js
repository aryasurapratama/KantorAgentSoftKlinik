import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';

const exec = promisify(execFile);
const failure = message => Object.assign(new Error(message), { status: 409 });
const hash = bytes => bytes === null ? null : createHash('sha256').update(bytes).digest('hex');
const normalized = bytes => bytes === null ? null : bytes.includes(0) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const equal = (a, b) => a === null || b === null ? a === b : normalized(a).equals(normalized(b));

async function target(base, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative) || /^[a-z]:/i.test(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..' || part === '.git')) throw failure('Path proposal tidak valid.');
  const resolvedBase = path.resolve(base);
  if ((await fs.lstat(resolvedBase)).isSymbolicLink()) throw failure('Root symlink ditolak.');
  const resolved = path.resolve(resolvedBase, relative);
  const rel = path.relative(resolvedBase, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw failure('Path di luar workspace.');
  let current = resolvedBase;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    try { const stat = await fs.lstat(current); if (stat.isSymbolicLink() || (current !== resolved && !stat.isDirectory())) throw failure('Path symlink atau parent bukan folder ditolak.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return resolved;
}
async function bytes(file) {
  try { if (!(await fs.lstat(file)).isFile()) throw failure('Target bukan berkas biasa.'); return await fs.readFile(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function write(file, content) {
  if (content === null) { await fs.rm(file, { force: true }); return; }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, content, { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
async function baseline(worktreePath, baseCommit, relative) {
  if (!/^[a-f0-9]{40,64}$/i.test(baseCommit)) throw failure('Commit baseline tidak valid.');
  const listing = await exec('git', ['ls-tree', '-z', baseCommit, '--', relative], { cwd: worktreePath, encoding: 'buffer', windowsHide: true });
  if (!listing.stdout.length) return null;
  const row = listing.stdout.toString('utf8');
  if (!/^100(?:644|755) blob /.test(row)) throw failure('Baseline bukan berkas biasa.');
  return (await exec('git', ['cat-file', 'blob', `${baseCommit}:${relative.replaceAll('\\', '/')}`], { cwd: worktreePath, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, windowsHide: true })).stdout;
}

export async function applyLocalProposal({ root, worktreePath, baseCommit, files, backupDir }) {
  if (!Array.isArray(files) || !files.length || files.length > 100 || new Set(files).size !== files.length) throw failure('Daftar berkas proposal tidak valid.');
  const rows = [];
  for (const relative of files) {
    const destination = await target(root, relative); const source = await target(worktreePath, relative);
    const before = await bytes(destination); const after = await bytes(source); const base = await baseline(worktreePath, baseCommit, relative);
    if (!equal(before, base)) throw failure(`Target berubah sejak baseline: ${relative}`);
    rows.push({ path: relative, before: before?.toString('base64') ?? null, after: after?.toString('base64') ?? null, beforeHash: hash(before), afterHash: hash(after) });
  }
  await fs.mkdir(backupDir, { recursive: true });
  const manifest = { root: path.resolve(root), rows, status: 'prepared' };
  const manifestPath = path.join(backupDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
  const written = [];
  try {
    for (const row of rows) {
      const destination = await target(root, row.path);
      if (hash(await bytes(destination)) !== row.beforeHash) throw failure(`Target berubah saat apply: ${row.path}`);
      await write(destination, row.after === null ? null : Buffer.from(row.after, 'base64')); written.push(row);
    }
  } catch (error) {
    for (const row of written.reverse()) await write(await target(root, row.path), row.before === null ? null : Buffer.from(row.before, 'base64'));
    throw error;
  }
  manifest.status = 'applied'; await fs.writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  return { mode: 'local', files: files.slice(), backupDir };
}

export async function rollbackLocalProposal({ root, backupDir }) {
  const manifestPath = path.join(backupDir, 'manifest.json'); const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.root !== path.resolve(root) || manifest.status !== 'applied' || !Array.isArray(manifest.rows)) throw failure('Backup rollback tidak valid.');
  for (const row of manifest.rows) if (hash(await bytes(await target(root, row.path))) !== row.afterHash) throw failure(`Target berubah setelah apply: ${row.path}`);
  for (const row of manifest.rows) await write(await target(root, row.path), row.before === null ? null : Buffer.from(row.before, 'base64'));
  manifest.status = 'rolled_back'; await fs.writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  return { mode: 'local', files: manifest.rows.map(row => row.path) };
}
