const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : null;

function scoreFromRate(completed, total) { return total > 0 ? Number((completed / total * 10).toFixed(2)) : null; }

export function evaluateEmployee(agentId, tasks = [], { independent = [] } = {}) {
  const owned = tasks.filter(task => task.assignedAgent === agentId || task.agentId === agentId);
  const finished = owned.filter(task => task.status === 'completed' || task.lifecycleStatus === 'COMPLETED');
  const failed = owned.filter(task => task.status === 'failed' || task.lifecycleStatus === 'FAILED');
  const quality = owned.map(task => task.quality?.score ?? task.evaluation?.score).filter(Number.isFinite);
  const independentScores = independent.filter(row => row.agentId === agentId).map(row => row.score).filter(Number.isFinite);
  const dimensions = {
    completion: scoreFromRate(finished.length, finished.length + failed.length),
    briefFit: quality.length ? clamp(quality.reduce((a, b) => a + b, 0) / quality.length) : null,
    independentReview: independentScores.length ? clamp(independentScores.reduce((a, b) => a + b, 0) / independentScores.length) : null,
    collaboration: owned.some(task => Array.isArray(task.collaboration) && task.collaboration.length) ? 10 : null,
    efficiency: owned.length ? scoreFromRate(finished.length, owned.length) : null,
  };
  const known = Object.entries(dimensions).filter(([, value]) => value !== null);
  const score = known.length ? Number((known.reduce((sum, [, value]) => sum + value, 0) / known.length).toFixed(2)) : null;
  return { agentId, score, target: 9.5, dimensions, evidence: { tasks: owned.length, completed: finished.length, failed: failed.length, independentReviews: independentScores.length }, passed: score !== null && score >= 9.5, limitations: score === null ? ['Belum ada data tugas/evaluator independen yang cukup.'] : known.length < 5 ? ['Sebagian dimensi belum memiliki bukti aktual.'] : [] };
}

export function evaluateRoster(agents = [], tasks = [], options = {}) { return agents.map(agent => evaluateEmployee(agent.agentId || agent.id, tasks, options)); }
