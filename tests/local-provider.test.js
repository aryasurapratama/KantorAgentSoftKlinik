import test from 'node:test';
import assert from 'node:assert/strict';
import { providerUrlAllowed } from '../api-security.js';

test('9Router accepts loopback v1 endpoints without opening arbitrary local providers', () => {
  for (const url of ['http://127.0.0.1:20128/v1', 'http://localhost:20128/v1/', 'http://[::1]:20128/v1']) {
    assert.equal(providerUrlAllowed(url, '9router'), true, url);
  }
  for (const url of ['http://192.168.1.2:20128/v1', 'https://example.com/v1', 'http://localhost:20128', 'http://localhost:20128/admin', 'http://localhost:20128/v1?key=test', 'http://user:pass@localhost:20128/v1', 'http://localhost:20128/v1#token']) {
    assert.equal(providerUrlAllowed(url, '9router'), false, url);
  }
  assert.equal(providerUrlAllowed('https://api.openai.com/v1', 'unknown'), false);
});
