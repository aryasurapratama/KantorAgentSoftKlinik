import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fingerprint, stopOwnedServer, acquireLauncherLock } from '../scripts/runtime.js';

test('launcher fingerprint changes with source; owned process verification refuses stale PID', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harmes-runtime-'));
  let child;
  try {
    await fs.mkdir(path.join(root, 'data'));
    const script = path.join(root, 'server.js');
    await fs.writeFile(script, 'setInterval(() => {}, 1000);');
    const before = await fingerprint(root, ['server.js']);
    await fs.writeFile(script, 'setInterval(() => {}, 2000);');
    assert.notEqual(await fingerprint(root, ['server.js']), before);
    const data = path.join(root, 'data');
    await fs.writeFile(path.join(data, 'server.pid'), String(process.pid));
    assert.equal(await stopOwnedServer(root, data), false);
    child = spawn(process.execPath, [script], { windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    await fs.writeFile(path.join(data, 'server.pid'), String(child.pid));
    assert.equal(await stopOwnedServer(path.join(root, 'foreign'), data), false);
    assert.equal(child.exitCode, null);
    assert.equal(await stopOwnedServer(root, data), true);
  } finally {
    if (child?.exitCode === null) child.kill();
    assert.equal(path.dirname(root), os.tmpdir());
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test('concurrent launcher lock serializes and releases', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harmes-lock-'));
  let first;
  try {
    first = await acquireLauncherLock(root, { timeoutMs: 1000, retryMs: 10 });
    const pending = acquireLauncherLock(root, { timeoutMs: 1000, retryMs: 10 });
    let settled = false; pending.then(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(settled, false);
    await first();
    const second = await pending;
    await second();
  } finally {
    await first?.();
    assert.equal(path.dirname(root), os.tmpdir());
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
