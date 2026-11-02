export const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS kantor_storage (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  previous_value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const clone = value => structuredClone(value);

function validName(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes('/') || !name.endsWith('.json')) throw new Error('Invalid storage filename');
  return name;
}

/** PostgreSQL implementation of the storage interface used by server.js. */
export async function createPostgresStorage({ pool, ownsPool = false } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
  await pool.query(POSTGRES_SCHEMA);
  let queue = Promise.resolve();
  const enqueue = operation => { const job = queue.catch(() => {}).then(operation); queue = job; return job; };

  async function row(name) {
    const result = await pool.query('SELECT value, previous_value FROM kantor_storage WHERE key = $1', [validName(name)]);
    return result.rows[0];
  }
  async function read(name, fallback, validator) {
    const item = await row(name);
    if (!item) return clone(fallback);
    const value = item.value;
    const valid = candidate => { try { return !validator || validator(candidate); } catch { return false; } };
    if (valid(value)) return clone(value);
    if (item.previous_value !== null && item.previous_value !== undefined && valid(item.previous_value)) {
      await pool.query('UPDATE kantor_storage SET value = previous_value, previous_value = NULL, updated_at = NOW() WHERE key = $1', [name]);
      return clone(item.previous_value);
    }
    return clone(fallback);
  }
  async function write(name, value) {
    validName(name);
    const snapshot = clone(value);
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
    writeJson: (fileName, value) => enqueue(() => write(fileName, value)),
    readSettings: (fallback, validator) => enqueue(() => read('settings.json', fallback, value => value && typeof value === 'object' && !Array.isArray(value) && (!validator || validator(value)))),
    writeSettings: value => { const snapshot = clone(value); return enqueue(() => write('settings.json', snapshot)); },
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
