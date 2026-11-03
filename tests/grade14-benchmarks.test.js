import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE14_BENCHMARKS, createGrade14Report } from '../grade14-benchmarks.js';

test('grade14 report exposes all 15 tests without inventing a score', () => {
  const empty = createGrade14Report();
  assert.equal(GRADE14_BENCHMARKS.length, 15);
  assert.equal(empty.status, 'not_verified');
  assert.equal(empty.grade, null);
  assert.equal(empty.total, 15);
  assert.ok(empty.benchmarks.every(item => item.status === 'not_run' && item.score === null));
});

test('grade14 report verifies only explicit evidence', () => {
  const report = createGrade14Report({ evidence: { ping: { passed: true, score: 9.8, evidence: { latencyMs: 1, codexCalls: 0 } } } });
  assert.equal(report.verified, 1);
  assert.equal(report.benchmarks.find(item => item.id === 'ping').status, 'verified');
  assert.equal(report.grade, null);
});
