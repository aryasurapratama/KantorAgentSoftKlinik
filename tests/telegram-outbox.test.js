import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTelegramOutbox} from '../telegram-outbox.js';

test('Telegram outbox deduplicates durable deliveries and records failures', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harmes-outbox-')); let calls = 0;
  try {
    const outbox = createTelegramOutbox({ dataDir, deliver: async item => { calls++; if (item.key === 'fail') throw Error('delivery failed'); } });
    await outbox.init(); const first = await outbox.enqueue({ key: 'ok', projectId: 'p', event: { type: 'waiting_approval' } }); const duplicate = await outbox.enqueue({ key: 'ok', projectId: 'p' });
    assert.equal(first.createdAt, duplicate.createdAt); await outbox.enqueue({ key: 'fail', projectId: 'p' }); await outbox.close();
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'notifications.json'), 'utf8')); assert.equal(calls, 2); assert.equal(saved.notifications.find(n => n.key === 'ok').status, 'sent'); assert.equal(saved.notifications.find(n => n.key === 'fail').status, 'failed');
    const restarted = createTelegramOutbox({ dataDir, deliver: async () => { throw Error('must not resend failed delivery'); } }); await restarted.init(); assert.equal((await restarted.snapshot()).notifications.length, 2); await restarted.close();
  } finally { await fs.rm(dataDir, { recursive: true, force: true }); }
});
