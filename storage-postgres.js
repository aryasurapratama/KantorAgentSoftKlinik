import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';

export const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS kantor_storage (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  previous_value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const clone = value => structuredClone(value);

// Keep credentials encrypted in JSONB just as the file adapter does. Windows
// uses the account-bound DPAPI; other systems use a local 0600 AES key.
const DPAPI = `Add-Type -AssemblyName System.Security; $r = [Console]::In.ReadToEnd() | ConvertFrom-Json; $b = [Convert]::FromBase64String($r.data); if ($r.action -eq 'encrypt') { $v = [Security.Cryptography.ProtectedData]::Protect($b, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) } else { $v = [Security.Cryptography.ProtectedData]::Unprotect($b, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) }; [Console]::Out.Write([Convert]::ToBase64String($v))`;
function dpapi(action, data) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows credential protection timeout')); }, 10000);
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
    child.on('error', () => reject(new Error('Windows credential protection unavailable')));
    child.on('close', code => { clearTimeout(timer); const value = output.trim(); code === 0 && value && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0 ? resolve(Buffer.from(value, 'base64')) : reject(new Error('Windows credential protection failed')); });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ action, data: data.toString('base64') }));
  });
}

function validName(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes('/') || !name.endsWith('.json')) throw new Error('Invalid storage filename');
  return name;
}

/** PostgreSQL implementation of the storage interface used by server.js. */
export async function createPostgresStorage({ pool, ownsPool = false, dataDir } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
  await pool.query(POSTGRES_SCHEMA);
  let queue = Promise.resolve();
  const enqueue = operation => { const job = queue.catch(() => {}).then(operation); queue = job; return job; };
  let key;
  async function localKey() {
    if (key) return key;
    if (!dataDir) throw new Error('dataDir is required for PostgreSQL settings encryption outside Windows');
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const file = path.join(dataDir, '.settings.key');
    try { key = await fs.readFile(file); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const candidate = randomBytes(32);
      try { await fs.writeFile(file, candidate, { flag: 'wx', mode: 0o600 }); key = candidate; }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; key = await fs.readFile(file); }
    }
    if (key.length !== 32) throw new Error('Invalid settings encryption key');
    await fs.chmod(file, 0o600); return key;
  }
  async function encodeSettings(value) {
    const bytes = Buffer.from(JSON.stringify(value));
    if (process.platform === 'win32') return { encryptedSettings: 1, algorithm: 'dpapi', data: (await dpapi('encrypt', bytes)).toString('base64') };
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', await localKey(), iv);
    const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { encryptedSettings: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  }
  async function decodeSettings(value) {
    if (!value?.encryptedSettings) return value;
    let bytes;
    if (value.algorithm === 'dpapi' && process.platform === 'win32') bytes = await dpapi('decrypt', Buffer.from(value.data, 'base64'));
    else if (value.algorithm === 'aes-256-gcm') { const cipher = createDecipheriv('aes-256-gcm', await localKey(), Buffer.from(value.iv, 'base64')); cipher.setAuthTag(Buffer.from(value.tag, 'base64')); bytes = Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]); }
    else throw new Error('Unsupported settings encryption');
    return JSON.parse(bytes.toString('utf8'));
  }

  async function row(name) {
    const result = await pool.query('SELECT value, previous_value FROM kantor_storage WHERE key = $1', [validName(name)]);
    return result.rows[0];
  }
  async function read(name, fallback, validator, settings = false) {
    const item = await row(name);
    if (!item) return clone(fallback);
    let value;
    try { value = settings ? await decodeSettings(item.value) : item.value; } catch { value = undefined; }
    const valid = candidate => { try { return !validator || validator(candidate); } catch { return false; } };
    if (valid(value)) return clone(value);
    let previous;
    try { previous = settings ? await decodeSettings(item.previous_value) : item.previous_value; } catch { previous = undefined; }
    if (item.previous_value !== null && item.previous_value !== undefined && valid(previous)) {
      await pool.query('UPDATE kantor_storage SET value = previous_value, previous_value = NULL, updated_at = NOW() WHERE key = $1', [name]);
      return clone(previous);
    }
    // Both copies failed validation/decryption. Persist the fallback so a
    // subsequent read does not repeatedly serve corrupted data or carry it
    // forward as `previous_value` on the next write. Keep this best-effort:
    // a transient database failure must not hide the readable fallback.
    try {
      const recovered = settings ? await encodeSettings(fallback) : clone(fallback);
      await pool.query('UPDATE kantor_storage SET value = $2::jsonb, previous_value = NULL, updated_at = NOW() WHERE key = $1', [name, JSON.stringify(recovered)]);
    } catch { /* recovery remains readable even when persistence fails */ }
    return clone(fallback);
  }
  async function write(name, value, settings = false) {
    validName(name);
    const snapshot = settings ? await encodeSettings(value) : clone(value);
    await pool.query(`
      INSERT INTO kantor_storage (key, value, previous_value, updated_at)
      VALUES ($1, $2::jsonb, NULL, NOW())
      ON CONFLICT (key) DO UPDATE SET
        previous_value = kantor_storage.value,
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [name, JSON.stringify(snapshot)]);
  }
  async function close() {
    if (ownsPool && typeof pool.end === 'function') await pool.end();
  }
  return {
    readJson: (fileName, fallback, validator) => enqueue(() => read(fileName, fallback, validator)),
    // Snapshot before queueing, matching the file adapter. Callers commonly
    // mutate their in-memory state immediately after an async write starts;
    // retaining that object would otherwise persist a later, unrelated value.
    writeJson: (fileName, value) => { const snapshot = clone(value); return enqueue(() => write(fileName, snapshot)); },
    readSettings: (fallback, validator) => enqueue(() => read('settings.json', fallback, value => value && typeof value === 'object' && !Array.isArray(value) && (!validator || validator(value)), true)),
    writeSettings: value => { const snapshot = clone(value); return enqueue(() => write('settings.json', snapshot, true)); },
    close,
    backend: 'postgres',
  };
}

/** Resolve an optional pg pool without loading pg for normal JSON mode. */
export async function connectPostgres({ databaseUrl, pool, pg } = {}) {
  if (pool) return { pool, ownsPool: false };
  let module = pg;
  if (!module) {
    try { module = await import('pg'); }
    catch (error) {
      error.message = `PostgreSQL storage requires the "pg" package (npm install pg): ${error.message}`;
      throw error;
    }
  }
  const Pool = module.Pool || module.default?.Pool;
  if (typeof Pool !== 'function') throw new Error('Invalid pg module: Pool constructor unavailable');
  return { pool: new Pool(databaseUrl ? { connectionString: databaseUrl } : {}), ownsPool: true };
}
