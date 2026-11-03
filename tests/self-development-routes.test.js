import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installSelfDevelopmentRoutes } from '../self-development-routes.js';

test('review route delegates with reviewer default actor', async () => {
  const calls = [];
  const app = express(); app.use(express.json());
  installSelfDevelopmentRoutes(app, { engine: { reviewPullRequest: async (...args) => { calls.push(args); return { status: 'approved' }; }, snapshot: async () => ({}) } });
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/self-development/proposals/p1/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: true }) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: 'approved' });
    assert.equal(calls[0][0], 'p1'); assert.equal(calls[0][1].actor, 'reviewer'); assert.equal(calls[0][1].approved, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
