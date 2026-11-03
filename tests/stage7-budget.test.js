import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBudget, actualUsage, createBudgetTracker, budgetStatus, rankTasksByPriority, summarizeResourceUsage } from '../budget-priority.js';

test('stage7 budgets retain limits and report warnings from actual usage', () => {
  assert.deepEqual(normalizeBudget({ tokenBudget: 100, maxRetries: 2, durationBudgetMs: 1000 }), { tokenBudget: 100, retryBudget: 2, durationBudgetMs: 1000, warningThreshold: 0.8 });
  assert.equal(actualUsage({ usage: { inputTokens: 4, outputTokens: 6 } }).totalTokens, 10);
  assert.equal(actualUsage({ usage: { inputTokens: 4 } }).totalTokens, null);
  const tracker = createBudgetTracker({ projectBudgets: { p1: { tokenBudget: 100, retryBudget: 2 } } });
  tracker.record({ projectId: 'p1', usage: { inputTokens: 70, outputTokens: 20 }, retries: 2 });
  const status = tracker.status('p1');
  assert.equal(status.tokens.used, 90);
  assert.equal(status.tokens.warning, true);
  assert.equal(status.retries.exceeded, true);
});

test('stage7 priority ranking is deterministic and resource snapshots separate scopes', () => {
  const ranked = rankTasksByPriority([{ id: 'low', priority: 1 }, { id: 'high', priority: 9 }]);
  assert.deepEqual(ranked.map(task => task.id), ['high', 'low']);
  const snapshot = summarizeResourceUsage({ projects: [{ id: 'p1', budget: { tokenBudget: 20 }, tasks: [{ assignedAgent: 'a1', inference: { usage: { inputTokens: 5, outputTokens: 5 } } }] }] });
  assert.equal(snapshot.projects.p1.tokens.used, 10);
  assert.equal(snapshot.agents.a1.tokens.used, 10);
});

test('budget status never invents missing token usage', () => {
  const status = budgetStatus({}, { tokenBudget: 10 });
  assert.equal(status.tokens.used, null);
  assert.equal(status.tokens.warning, false);
});
