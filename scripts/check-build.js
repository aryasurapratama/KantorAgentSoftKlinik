import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'dist/assets');
const files = await fs.readdir(folder);
let javascript = 0, styles = 0;
for (const name of files) {
  if (!/\.(js|css)$/.test(name)) continue;
  const bytes = gzipSync(await fs.readFile(path.join(folder, name))).length;
  if (name.endsWith('.js')) javascript += bytes;
  else styles += bytes;
}
assert.ok(javascript > 0, 'Build must contain frontend JavaScript');
assert.ok(javascript <= 200 * 1024, `Frontend JavaScript exceeds 200 KiB gzip: ${javascript}`);
assert.ok(styles <= 32 * 1024, `Frontend CSS exceeds 32 KiB gzip: ${styles}`);
const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8');
assert.ok(!/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//i.test(html), 'Application shell must load assets locally');
console.log(`Build budget passed: JS ${(javascript / 1024).toFixed(1)} KiB gzip; CSS ${(styles / 1024).toFixed(1)} KiB gzip. 3D loads separately.`);
