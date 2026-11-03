import test from 'node:test';
import assert from 'node:assert/strict';
import { githubApiUrl, normalizeRepository, normalizeRepositorySelection, sanitizeBranchName, operationPolicy, classifyGithubError, healthStatus, createGithubClient } from '../github-integration.js';

test('GitHub URL and repository validation', () => {
  assert.equal(String(githubApiUrl('/user/repos')), 'https://api.github.com/user/repos');
  assert.equal(normalizeRepository('https://github.com/acme/app.git'), 'acme/app');
  assert.deepEqual(normalizeRepositorySelection(['acme/app', 'acme/app']), ['acme/app']);
  assert.throws(() => githubApiUrl('https://evil.test/x'));
  assert.throws(() => normalizeRepository('acme'));
});

test('branch sanitizer and operation guardrails', () => {
  assert.equal(sanitizeBranchName('feature/My change!'), 'feature/My-change');
  assert.equal(sanitizeBranchName('...'), 'work');
  assert.equal(operationPolicy('push', { branch: 'main' }).allowed, false);
  assert.equal(operationPolicy('update-file', { branch: 'feature/x' }).allowed, true);
  assert.equal(operationPolicy('delete-repository', { repository: 'a/b' }).allowed, false);
  assert.equal(operationPolicy('write-secret', {}).allowed, false);
});

test('error classification and health mapping', () => {
  assert.equal(classifyGithubError({ status: 401 }).code, 'auth');
  assert.equal(classifyGithubError({ status: 404 }).code, 'not_found');
  assert.equal(healthStatus({ status: 200 }).status, 'healthy');
  assert.equal(healthStatus({ status: 401 }).status, 'unauthorized');
});

test('client injects auth and parses errors', async () => {
  let seen;
  const client = createGithubClient({ token: 'secret', fetch: async (url, options) => { seen = { url: String(url), options }; return new Response(JSON.stringify({ login: 'arya' }), { status: 200, headers: { 'content-type': 'application/json' } }); } });
  assert.deepEqual(await client.request('/user'), { login: 'arya' });
  assert.equal(seen.options.headers.authorization, 'Bearer secret');
  const bad = createGithubClient({ fetch: async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }) });
  await assert.rejects(() => bad.request('/missing'), e => e.status === 404);
});
