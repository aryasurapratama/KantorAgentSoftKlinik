import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRouter, codexConfigPath, readCodexConfigStatus } from '../scripts/coding.js';

test('Codex routing inspection preserves config and never returns credentials', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kantor-coding-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'config.toml');
  const source = `model_provider = "9router"
[model_providers.9router]
base_url = "http://127.0.0.1:20128/v1"
wire_api = "responses"
[model_providers.9router.http_headers]
Authorization = "secret-test-value"
`;
  fs.writeFileSync(config, source);
  assert.deepEqual(readCodexConfigStatus(config), { exists: true, hasRouterProvider: true, hasIncompatibleAgentsSetting: false });
  assert.equal(fs.readFileSync(config, 'utf8'), source);
  assert.equal(JSON.stringify(readCodexConfigStatus(config)).includes('secret-test-value'), false);
  fs.writeFileSync(config, source.replace('model_provider = "9router"', 'model_provider = "openai"'));
  assert.equal(readCodexConfigStatus(config).hasRouterProvider, false);
  fs.writeFileSync(config, source.replace('127.0.0.1:20128', 'example.com:20128'));
  assert.equal(readCodexConfigStatus(config).hasRouterProvider, false);
  fs.writeFileSync(config, source + '[agents]\ndefault_subagent_model = "example-model"\n');
  assert.equal(readCodexConfigStatus(config).hasIncompatibleAgentsSetting, true);
  assert.deepEqual(readCodexConfigStatus(path.join(dir, 'missing.toml')), { exists: false, hasRouterProvider: false, hasIncompatibleAgentsSetting: false });
});

test('Codex home respects an existing environment override', () => {
  assert.equal(codexConfigPath({ CODEX_HOME: 'custom-home' }, 'ignored-home'), path.join('custom-home', 'config.toml'));
});

test('9Router health checks require model IDs and report connection failures', async () => {
  let request;
  const ready = await checkRouter('http://127.0.0.1:20128', async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'cx/gpt-6.1-sol' }] }) };
  });
  assert.equal(request.url, 'http://127.0.0.1:20128/v1/models');
  assert.ok(request.options.signal);
  assert.equal(request.options.headers, undefined);
  assert.equal(ready.ok, true);
  assert.deepEqual(ready.models, ['cx/gpt-6.1-sol']);
  const empty = await checkRouter('http://127.0.0.1:20128', async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
  assert.equal(empty.ok, false);
  const failed = await checkRouter('http://127.0.0.1:20128', async () => { throw new Error('connection refused'); });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 0);
  const secure = await checkRouter('https://127.0.0.1:20128/v1', async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'secure-model' }] }) }));
  assert.equal(secure.ok, true);
});
