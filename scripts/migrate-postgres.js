import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createStorage } from '../storage.js';
import { POSTGRES_SCHEMA } from '../storage-postgres.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const databaseUrl = process.env.DATABASE_URL || process.env.STORAGE_DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error('DATABASE_URL belum diatur.');
const force = process.argv.includes('--force');
const files = ['settings.json', 'state.json', 'operations.json', 'notifications.json'];
const pool = new pg.Pool({ connectionString: databaseUrl });
const legacy = await createStorage({ dataDir, backend: 'json' });
const target = await createStorage({ dataDir, databaseUrl, backend: 'postgres' });
try {
  await pool.query(POSTGRES_SCHEMA);
  for (const file of files) {
    try { await fs.access(path.join(dataDir, file)); } catch { continue; }
    const result = await pool.query('SELECT 1 FROM kantor_storage WHERE key = $1', [file]);
    if (result.rowCount && !force) { console.log(`Lewati ${file}: sudah ada di PostgreSQL.`); continue; }
    const value = file === 'settings.json'
      ? await legacy.readSettings({})
      : await legacy.readJson(file, {});
    if (file === 'settings.json') await target.writeSettings(value);
    else await target.writeJson(file, value);
    console.log(`${force && result.rowCount ? 'Perbarui' : 'Migrasi'} ${file}.`);
  }
} finally {
  await pool.end();
  await target.close?.();
}
