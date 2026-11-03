import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

// OS-owned sockets disappear when the launcher exits or crashes. No stale lock
// file can strand startup, and concurrent launchers never replace server.pid.
export async function acquireLauncherLock(root, { timeoutMs = 120000, retryMs = 150 } = {}) {
  const canonical = await fs.realpath(root);
  const identity = crypto.createHash('sha256').update(process.platform === 'win32' ? canonical.toLowerCase() : canonical).digest('hex').slice(0, 32);
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\kantor-ai-launcher-${identity}` : `\0kantor-ai-launcher-${identity}`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lock = net.createServer(socket => socket.destroy());
    const error = await new Promise(resolve => {
      lock.once('error', resolve);
      lock.listen({ path: endpoint, exclusive: true }, () => resolve(null));
    });
    if (!error) {
      lock.unref();
      let released = false;
      return async () => { if (!released) { released = true; await new Promise((resolve, reject) => lock.close(error => error ? reject(error) : resolve())); } };
    }
    if (error.code !== 'EADDRINUSE') throw error;
    if (Date.now() >= deadline) throw new Error('Peluncur lain masih memproses aplikasi. Tunggu proses tersebut selesai lalu coba lagi.');
    await new Promise(resolve => setTimeout(resolve, Math.min(retryMs, Math.max(1, deadline - Date.now()))));
  }
}

export async function fingerprint(root, entries) {
  const hash = crypto.createHash('sha256');
  async function visit(relative) {
    const absolute = path.join(root, relative);
    let stat;
    try { stat = await fs.stat(absolute); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) await visit(path.join(relative, name));
    } else {
      hash.update(relative.replaceAll('\\', '/')); hash.update(await fs.readFile(absolute));
    }
  }
  for (const entry of entries) await visit(entry);
  return hash.digest('hex');
}

// A stale PID alone never authorizes terminating a process. Check its executable
// and exact absolute server script first; leave manually started servers alone.
export async function stopOwnedServer(root, dataDir) {
  let pid;
  try { pid = Number(await fs.readFile(path.join(dataDir, 'server.pid'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!Number.isSafeInteger(pid) || pid < 1 || pid === process.pid) return false;
  const script = path.resolve(root, 'server.js');
  if (process.platform === 'win32') {
    const command = `$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$candidate = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$request.pid) -ErrorAction SilentlyContinue
if (!$candidate) { exit 0 }
if ($candidate.ExecutablePath -ine $request.executable) { exit 3 }
$pattern = '(?:^|\\s)"?' + [regex]::Escape($request.script) + '"?(?:\\s|$)'
if ($candidate.CommandLine -notmatch $pattern) { exit 3 }
Stop-Process -Id ([int]$request.pid) -ErrorAction Stop
exit 0`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      input: JSON.stringify({ pid, executable: process.execPath, script }), encoding: 'utf8', windowsHide: true,
    });
    if (result.error || result.status !== 0) return false;
  } else {
    try {
      const executable = await fs.readlink(`/proc/${pid}/exe`);
      const args = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
      if (path.resolve(executable) !== path.resolve(process.execPath) || !args.includes(script)) return false;
      process.kill(pid, 'SIGTERM');
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') return false; }
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(pid, 0); } catch { await fs.rm(path.join(dataDir, 'server.pid'), { force: true }); return true; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}
