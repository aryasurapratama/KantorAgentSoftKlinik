import test from 'node:test';
import assert from 'node:assert/strict';
import { makeKnowledgeEntry, retrieveKnowledgeEntries, createKnowledgeStore } from '../knowledge-base.js';

test('knowledge retrieval enforces client isolation and preserves source metadata', () => {
  const a = makeKnowledgeEntry({ clientId: 'client-a', content: 'SOP invoice approval', source: { label: 'billing-sop.md', uri: 'https://example.test/billing-sop.md' } });
  const b = makeKnowledgeEntry({ clientId: 'client-b', content: 'SOP invoice approval', source: { label: 'other.md' } });
  const result = retrieveKnowledgeEntries([a, b], 'invoice', { clientId: 'client-a', maxChars: 200 });
  assert.match(result, /billing-sop\.md/);
  assert.doesNotMatch(result, /other\.md/);
  assert.match(result, /version 1/);
});

test('knowledge store versions updates and records learning', async () => {
  let value = { schemaVersion: 1, entries: [] };
  const storage = { readJson: async (_name, fallback, validator) => validator(value) ? structuredClone(value) : structuredClone(fallback), writeJson: async (_name, next) => { value = structuredClone(next); } };
  const store = createKnowledgeStore({ storage });
  const first = await store.add({ clientId: 'acme', content: 'Initial runbook', source: { label: 'runbook.md' } });
  const updated = await store.update(first.id, { content: 'Updated runbook' });
  assert.equal(updated.version, 2);
  const error = await store.recordError({ clientId: 'acme', content: 'Timeout observed', source: { label: 'incident-1' } });
  assert.equal(error.type, 'error');
  assert.equal((await store.list({ clientId: 'acme' })).length, 2);
});
