import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';

// Windows secrets are bound to the current Windows user by DPAPI. Elsewhere,
// AES-GCM uses a local 0600 key: protect the data directory/backups separately;
// an attacker who can read both the key and ciphertext can decrypt settings.
const DPAPI = `Add-Type -AssemblyName System.Security; $r = [Console]::In.ReadToEnd() | ConvertFrom-Json; $b = [Convert]::FromBase64String($r.data); if ($r.action -eq 'encrypt') { $v = [Security.Cryptography.ProtectedData]::Protect($b, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) } else { $v = [Security.Cryptography.ProtectedData]::Unprotect($b, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) }; [Console]::Out.Write([Convert]::ToBase64String($v))`;
function dpapi(action, data) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows credential protection timeout')); }, 10000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 16000000) { child.kill(); reject(new Error('Windows credential output too large')); } });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Windows credential protection unavailable')));
    child.on('close', code => { clearTimeout(timer); const value=output.trim(); code === 0 && value && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length%4===0 ? resolve(Buffer.from(value, 'base64')) : reject(new Error('Windows credential protection failed')); });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ action, data: data.toString('base64') }));
  });
}

export async function createStorage(options = {}) {
  const { dataDir, databaseUrl, pool, pg, backend, postgres } = options;
  const postgresPool = pool ?? (postgres && typeof postgres === 'object' ? postgres.pool : undefined);
  const postgresModule = pg ?? (postgres && typeof postgres === 'object' ? postgres.pg : undefined);
  const postgresDatabaseUrl = databaseUrl ?? (typeof postgres === 'string' ? postgres : postgres?.url);
  // PostgreSQL is opt-in via a connection URL (or an injected pool). Keeping
  // this branch before any filesystem access preserves the existing JSON mode
  // and permits deployments where no local data directory exists.
  const postgresUrl = postgresDatabaseUrl ?? process.env.STORAGE_DATABASE_URL ?? process.env.POSTGRES_URL ??
    ((backend === 'postgres' || backend === 'postgresql' || process.env.STORAGE_BACKEND === 'postgres' || process.env.STORAGE_BACKEND === 'postgresql' || process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : undefined);
  const postgresRequested = postgresPool || postgresUrl || backend === 'postgres' || backend === 'postgresql' || process.env.STORAGE_BACKEND === 'postgres' || process.env.STORAGE_BACKEND === 'postgresql';
  if (postgresRequested) {
    const { connectPostgres, createPostgresStorage } = await import('./storage-postgres.js');
    const connection = await connectPostgres({ databaseUrl: postgresUrl, pool: postgresPool, pg: postgresModule });
    return createPostgresStorage(connection);
  }
  if (!dataDir) throw new TypeError('dataDir is required for JSON storage');
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  let queue = Promise.resolve();
  let key;
  const enqueue = operation => { const job = queue.catch(() => {}).then(operation); queue = job; return job; };
  function location(fileName) {
    if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || !fileName.endsWith('.json')) throw new Error('Invalid storage filename');
    return path.join(dataDir, fileName);
  }
  async function atomic(file, content) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, file);
      await fs.chmod(file, 0o600);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async function localKey() {
    if (key) return key;
    const file = path.join(dataDir, '.settings.key');
    try { key = await fs.readFile(file); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const candidate = randomBytes(32);
      try { await fs.writeFile(file, candidate, { flag: 'wx', mode: 0o600 }); key = candidate; }
      catch (error) { if (error.code !== 'EEXIST') throw error; key = await fs.readFile(file); }
    }
    if (key.length !== 32) throw new Error('Invalid settings encryption key');
    await fs.chmod(file, 0o600);
    return key;
  }
  async function encode(value) {
    const bytes = Buffer.from(JSON.stringify(value));
    if (process.platform === 'win32') return { encryptedSettings: 1, algorithm: 'dpapi', data: (await dpapi('encrypt', bytes)).toString('base64') };
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await localKey(), iv);
    const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { encryptedSettings: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  }
  async function decode(value) {
    if (!value?.encryptedSettings) return value;
    let bytes;
    if (value.algorithm === 'dpapi' && process.platform === 'win32') bytes = await dpapi('decrypt', Buffer.from(value.data, 'base64'));
    else if (value.algorithm === 'aes-256-gcm') {
      const cipher = createDecipheriv('aes-256-gcm', await localKey(), Buffer.from(value.iv, 'base64'));
      cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      bytes = Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]);
    } else throw new Error('Unsupported settings encryption');
    return JSON.parse(bytes.toString('utf8'));
  }
  async function parse(file, validator, settings) {
    let value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (settings) value = await decode(value);
    if (validator && !validator(value)) throw new Error('Stored JSON failed schema validation');
    return value;
  }
  async function quarantine(file, settings) {
    const target = `${file}.corrupt-${Date.now()}-${randomUUID()}`;
    try {
      if (settings) {
        const bytes = await fs.readFile(file, 'utf8');
        await atomic(target, JSON.stringify(await encode({ corruptFileBytes: bytes })));
        await fs.rm(file);
      } else await fs.rename(file, target);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function read(fileName, fallback, validator, settings = false) {
    const file = location(fileName);
    try { return await parse(file, validator, settings); } catch (primaryError) {
      let recovered;
      try { recovered = await parse(`${file}.bak`, validator, settings); }
      catch (backupError) {
        if (primaryError.code === 'ENOENT' && backupError.code === 'ENOENT') return structuredClone(fallback);
        await quarantine(file, settings);
        await quarantine(`${file}.bak`, settings);
        process.emitWarning(`Storage recovery: ${fileName} invalid; quarantined original and using defaults`, { code: 'STORAGE_RECOVERY' });
        return structuredClone(fallback);
      }
      await quarantine(file, settings);
      await atomic(file, JSON.stringify(settings ? await encode(recovered) : recovered, null, 2));
      return recovered;
    }
  }
  async function write(fileName, value, settings = false) {
    const file = location(fileName);
    let previous;
    try { previous = await parse(file, undefined, settings); }
    catch (error) {
      if (error.code !== 'ENOENT') {
        try { previous = await parse(`${file}.bak`, undefined, settings); } catch {}
        await quarantine(file, settings);
      }
    }
    // Encrypt the previous plaintext version too: migration never copies secrets
    // into a plaintext .bak file.
    if (previous !== undefined) await atomic(`${file}.bak`, JSON.stringify(settings ? await encode(previous) : previous, null, 2));
    else if (settings) {
      try { const backup = await parse(`${file}.bak`, undefined, true); await atomic(`${file}.bak`, JSON.stringify(await encode(backup), null, 2)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await atomic(file, JSON.stringify(settings ? await encode(value) : value, null, 2));
  }
  return {
    readJson: (fileName, fallback, validator) => enqueue(() => read(fileName, fallback, validator)),
    writeJson: (fileName, value) => { const snapshot = structuredClone(value); return enqueue(() => write(fileName, snapshot)); },
    readSettings: (fallback, validator) => enqueue(() => read('settings.json', fallback, value => value && typeof value === 'object' && !Array.isArray(value) && (!validator || validator(value)), true)),
    writeSettings: value => { const snapshot = structuredClone(value); return enqueue(() => write('settings.json', snapshot, true)); },
  };
}
