import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessage, fastResponse, isInternalDevelopmentRequest } from '../fast-router.js';

test('fast router answers deterministic probes without an AI route', () => {
  for (const [input, expected] of [['ping', 'pong'], ['halo', 'Halo! Kantor AI siap membantu.'], ['hallo', 'Halo! Kantor AI siap membantu.'], ['health-check', 'Kantor AI sehat dan siap menerima permintaan.']]) {
    const decision = classifyMessage(input);
    assert.equal(decision.kind, 'deterministic');
    assert.equal(decision.priority, 100);
    assert.equal(fastResponse(input), expected);
  }
});

test('internal office visual changes use coding even when a meeting is requested', () => {
  const request = 'lanjutkan di depan resepsioni ada logo yang tidak sesui dengan kantor soft klinik silhakan di ubah ya tim developer pak arya adakan meeting dan animasi tim bener bener duduk bahas gitu salking sharin';
  assert.equal(isInternalDevelopmentRequest(request), true);
  assert.equal(classifyMessage(request).route, 'coding');
  for (const question of ['Bagaimana cara ubah logo kantor AI?', 'Apakah tim pengembangan sedang bekerja?', 'Jelaskan quality assurance']) {
    assert.equal(isInternalDevelopmentRequest(question), false);
    assert.equal(classifyMessage(question).route, 'chat');
  }
});

test('fast router selects specialist lanes while preserving ordinary chat', () => {
  assert.equal(classifyMessage('Perbaiki bug API TypeScript').route, 'coding');
  assert.equal(classifyMessage('Buat notulen meeting besok').route, 'meeting');
  assert.equal(classifyMessage('Jelaskan cara kerja cache').route, 'chat');
});
