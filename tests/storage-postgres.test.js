import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStorage } from '../storage-postgres.js';

function fakePool(initial = {}) {
  const rows = new Map(Object.entries(initial).map(([key, value]) => [key, { value: value.value, previous_value: value.previous_value ?? null }]));
  return {
    rows,
    async query(sql, params = []) {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('SELECT')) return { rows: rows.has(params[0]) ? [rows.get(params[0])] : [] };
      if (sql.includes('SET value = $2::jsonb')) {
        rows.set(params[0], { value: JSON.parse(params[1]), previous_value: null });
        return { rows: [] };
      }
      if (sql.includes('SET value = previous_value')) {
        const row = rows.get(params[0]);
        rows.set(params[0], { value: row.previous_value, previous_value: null });
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO kantor_storage')) {
        const previous = rows.get(params[0])?.value ?? null;
        rows.set(params[0], { value: JSON.parse(params[1]), previous_value: previous });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('PostgreSQL storage persists fallback after both copies fail validation', async () => {
  const pool = fakePool({ 'state.json': { value: { corrupt: true }, previous_value: { also: 'corrupt' } } });
  const storage = await createPostgresStorage({ pool });
  const fallback = { tasks: [], messages: [] };
  assert.deepEqual(await storage.readJson('state.json', fallback, value => Array.isArray(value?.tasks)), fallback);
  assert.deepEqual(pool.rows.get('state.json'), { value: fallback, previous_value: null });
  assert.deepEqual(await storage.readJson('state.json', { changed: true }, value => Array.isArray(value?.tasks)), fallback);
});

test('PostgreSQL JSON writes snapshot mutable values before queueing', async () => {
  const pool = fakePool();
  const storage = await createPostgresStorage({ pool });
  const value = { count: 1 };
  const write = storage.writeJson('state.json', value);
  value.count = 2;
  await write;
  assert.deepEqual(pool.rows.get('state.json').value, { count: 1 });
});
