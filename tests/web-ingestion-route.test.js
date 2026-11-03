import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installWorkspaceRoutes } from '../workspace-routes.js';

function fixture(t, ingest) {
  const state = { documents: [] };
  const app = express(); app.use(express.json());
  installWorkspaceRoutes(app, { getState: () => state, getSettings: () => ({ integrations: {} }), save: async () => {}, activity: async () => {}, ingest });
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return { state, call: (path, options = {}) => fetch(base + path, { headers: { 'content-type': 'application/json' }, ...options }) };
}

test('web ingestion persists provenance, capture grade, and deduplicates identical source', async t => {
  let calls = 0;
  const result = { content: 'SOP Softklinik', source: { label: 'example.com', uri: 'https://example.com/sop', host: 'example.com', fetchedAt: '2026-11-03T00:00:00.000Z', sha256: 'a'.repeat(64), truncated: false }, fetchedAt: '2026-11-03T00:00:00.000Z', sha256: 'a'.repeat(64), truncated: false };
  const x = fixture(t, async () => { calls++; return structuredClone(result); });
  let response = await x.call('/api/knowledge/ingest', { method: 'POST', body: JSON.stringify({ url: result.source.uri, tags: ['sop'] }) });
  assert.equal(response.status, 201); const body = await response.json(); assert.equal(body.document.ingestionQuality.score, 10); assert.equal(x.state.documents[0].source.quality.score, 10);
  response = await x.call('/api/knowledge/ingest', { method: 'POST', body: JSON.stringify({ url: result.source.uri }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).document.duplicate, true); assert.equal(calls, 2);
});

test('web ingestion rejects incomplete provenance from an injected fetcher', async t => {
  const x = fixture(t, async () => ({ content: 'missing metadata', source: { label: 'example.com', uri: 'https://example.com/a' } }));
  const response = await x.call('/api/knowledge/ingest', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/a' }) });
  assert.equal(response.status, 502); assert.match((await response.json()).error, /metadata|provenan/i);
});

test('web ingestion rechecks document cap after concurrent fetches', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const result = url => ({ content: url, fetchedAt: new Date().toISOString(), sha256: 'a'.repeat(64), truncated: false, source: { label: 'example.com', uri: url, host: 'example.com', fetchedAt: new Date().toISOString(), sha256: 'a'.repeat(64), truncated: false } });
  const x = fixture(t, async input => { await gate; return result(input.url); });
  for (let i = 0; i < 19; i++) x.state.documents.push({ id: String(i), content: 'x', clientId: 'local', source: { uri: `https://example.com/${i}`, sha256: String(i).padEnd(64, 'x') } });
  const one = x.call('/api/knowledge/ingest', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/a' }) });
  const two = x.call('/api/knowledge/ingest', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/b' }) });
  await new Promise(resolve => setTimeout(resolve, 20)); release();
  const responses = await Promise.all([one, two]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(x.state.documents.length, 20);
});
