import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBudget, actualUsage, budgetStatus, rankTasksByPriority } from '../budget-priority.js';

test('budget governance keeps unknown usage unknown and warns on actual usage', () => {
  assert.equal(actualUsage({ usage: {} }).totalTokens, null);
  const status = budgetStatus({ inputTokens: 80, outputTokens: 20 }, normalizeBudget({ tokenBudget: 100 }));
  assert.equal(status.exceeded, true);
});

test('priority ranking is deterministic and deadline-aware', () => {
  const ranked = rankTasksByPriority([{ id: 'late', priority: 1, dueAt: '2020-01-01T00:00:00Z' }, { id: 'normal', priority: 5 }], { now: Date.parse('2025-01-01T00:00:00Z') });
  assert.equal(ranked[0].id, 'late');
});
