import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('Stage 9 deployment templates exist and document non-deployment status', () => {
  for (const file of ['Dockerfile', 'docker-compose.stage9.yml', 'deploy/nginx.stage9.conf', 'deploy/README.md', 'scripts/healthcheck.js']) assert.equal(fs.existsSync(file), true, file);
  assert.match(fs.readFileSync('deploy/README.md', 'utf8'), /templates only/i);
  assert.match(fs.readFileSync('Dockerfile', 'utf8'), /npm prune --omit=dev/, 'runtime image must prune build-only dependencies');
  assert.match(fs.readFileSync('Dockerfile', 'utf8'), /PORT=8787/, 'container default port must match EXPOSE and healthcheck');
  assert.match(fs.readFileSync('Dockerfile', 'utf8'), /HOST=0\.0\.0\.0/, 'container must bind beyond loopback for reverse proxy');
  assert.match(fs.readFileSync('server.js', 'utf8'), /process\.env\.HOST \|\| '127\.0\.0\.1'/, 'server host must be configurable');
  assert.match(fs.readFileSync('.dockerignore', 'utf8'), /\.env\n/);
  assert.match(fs.readFileSync('.dockerignore', 'utf8'), /data\//);
  assert.match(fs.readFileSync('deploy/nginx.stage9.conf', 'utf8'), /client_max_body_size 32m/);
});

test('healthcheck script parses', () => {
  const result = spawnSync(process.execPath, ['--check', 'scripts/healthcheck.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync('scripts/healthcheck.js', 'utf8'), /process\.env\.PORT \|\| 4318/);
});
