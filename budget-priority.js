// Stage 7 resource governance.  This module only records provider-reported
// usage; missing usage is kept unknown and never estimated.

const finite = value => Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function limit(value, aliases = []) {
  if (finite(value)) return value;
  for (const candidate of aliases) if (finite(candidate)) return candidate;
  return null;
}

/** Normalize one project or agent budget. null means no configured limit. */
export function normalizeBudget(input = {}, defaults = {}) {
  input = input && typeof input === 'object' ? input : {};
  defaults = defaults && typeof defaults === 'object' ? defaults : {};
  const warningThreshold = finite(input.warningThreshold)
    ? Math.min(1, input.warningThreshold)
    : (finite(defaults.warningThreshold) ? Math.min(1, defaults.warningThreshold) : 0.8);
  const tokenBudget = limit(input.tokenBudget, [input.tokens, input.maxTokens, defaults.tokenBudget]);
  const retryBudget = limit(input.retryBudget, [input.maxRetries, input.retryLimit, defaults.retryBudget, defaults.maxRetries]);
  const durationBudgetMs = limit(input.durationBudgetMs, [input.durationMs, input.maxDurationMs, defaults.durationBudgetMs]);
  return Object.freeze({ tokenBudget, retryBudget, durationBudgetMs, warningThreshold });
}

/** Extract only actual provider usage from a record. No price/token estimates. */
export function actualUsage(record = {}) {
  const usage = record.usage && typeof record.usage === 'object' ? record.usage : record;
  const inputTokens = integer(usage.inputTokens) ? usage.inputTokens : null;
  const outputTokens = integer(usage.outputTokens) ? usage.outputTokens : null;
  const totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : (integer(usage.totalTokens) ? usage.totalTokens : null);
  const durationMs = finite(record.durationMs) ? record.durationMs : (finite(usage.durationMs) ? usage.durationMs : null);
  return { inputTokens, outputTokens, totalTokens, durationMs, known: totalTokens !== null || durationMs !== null };
}

function blank() { return { inputTokens: 0, outputTokens: 0, tokens: 0, tokenRecords: 0, durationMs: 0, durationRecords: 0, retries: 0, records: 0 }; }
function addUsage(total, usage, retries = 0) {
  total.records++;
  if (usage.inputTokens !== null) total.inputTokens += usage.inputTokens;
  if (usage.outputTokens !== null) total.outputTokens += usage.outputTokens;
  if (usage.totalTokens !== null) { total.tokens += usage.totalTokens; total.tokenRecords++; }
  if (usage.durationMs !== null) { total.durationMs += usage.durationMs; total.durationRecords++; }
  if (finite(retries)) total.retries += retries;
  return total;
}

function scopeStatus(scope, budget) {
  const dimensions = {};
  const specs = [['tokens', budget.tokenBudget, scope.tokens, scope.tokenRecords], ['retries', budget.retryBudget, scope.retries, scope.records], ['durationMs', budget.durationBudgetMs, scope.durationMs, scope.durationRecords]];
  for (const [name, cap, used, knownRecords] of specs) {
    const known = name === 'tokens' ? knownRecords > 0 : name === 'durationMs' ? knownRecords > 0 : true;
    const ratio = cap !== null && known ? used / cap : null;
    dimensions[name] = { budget: cap, used: known ? used : null, remaining: cap === null || !known ? null : Math.max(0, cap - used), ratio, warning: ratio !== null && ratio >= budget.warningThreshold, exceeded: ratio !== null && ratio >= 1, known };
  }
  const warnings = Object.entries(dimensions).filter(([, value]) => value.warning).map(([name, value]) => value.exceeded ? `${name}_exceeded` : `${name}_warning`);
  return { ...dimensions, warning: warnings.length > 0, exceeded: warnings.some(value => value.endsWith('_exceeded')), warnings };
}

/** Mutable tracker for project and per-agent actual resource usage. */
export function createBudgetTracker({ projectBudgets = {}, agentBudgets = {}, warningThreshold = 0.8 } = {}) {
  const projects = new Map(), agents = new Map(), projectConfig = new Map(), agentConfig = new Map();
  const configure = (map, key, value) => { if (id(key)) map.set(key, normalizeBudget(value, { warningThreshold })); };
  for (const [key, value] of Object.entries(projectBudgets || {})) configure(projectConfig, key, value);
  for (const [key, value] of Object.entries(agentBudgets || {})) configure(agentConfig, key, value);
  const ensure = (map, key) => { if (!map.has(key)) map.set(key, blank()); return map.get(key); };
  const record = ({ projectId, agentId, usage = {}, durationMs, retries = 0, retry = false } = {}) => {
    const project = id(projectId), agent = id(agentId), actual = actualUsage({ usage, durationMs });
    const retryCount = finite(retries) ? retries : (retry === true ? 1 : 0);
    if (project) addUsage(ensure(projects, project), actual, retryCount);
    if (agent) addUsage(ensure(agents, agent), actual, retryCount);
    return { projectId: project, agentId: agent, usage: actual, retries: retryCount, project: project ? status(project, 'project') : null, agent: agent ? status(agent, 'agent') : null };
  };
  const status = (key, kind = 'project') => {
    key = id(key); if (!key) return null;
    const isAgent = kind === 'agent';
    const config = (isAgent ? agentConfig : projectConfig).get(key) || normalizeBudget({}, { warningThreshold });
    const usage = (isAgent ? agents : projects).get(key) || blank();
    return { id: key, kind: isAgent ? 'agent' : 'project', budget: config, usage: structuredClone(usage), ...scopeStatus(usage, config) };
  };
  const snapshot = () => ({ projects: Object.fromEntries([...projectConfig.keys(), ...projects.keys()].map(key => [key, status(key, 'project')])), agents: Object.fromEntries([...agentConfig.keys(), ...agents.keys()].map(key => [key, status(key, 'agent')])) });
  return Object.freeze({ record, status, snapshot, configureProject: (key, value) => configure(projectConfig, key, value), configureAgent: (key, value) => configure(agentConfig, key, value) });
}

export function budgetStatus(usage = {}, budget = {}) {
  const tracker = createBudgetTracker({ projectBudgets: { scope: budget } });
  tracker.record({ projectId: 'scope', usage });
  return tracker.status('scope');
}
export const checkBudget = budgetStatus;
export const recordActualUsage = actualUsage;

function deadlineScore(task, now) {
  const raw = task?.deadline || task?.dueAt || task?.dueDate;
  const time = Date.parse(raw || '');
  if (!Number.isFinite(time)) return 0;
  const hours = (time - now) / 3600000;
  if (hours <= 0) return 40;
  return Math.max(0, Math.min(40, 40 * (1 - hours / (24 * 7))));
}

/** Score a task from explicit priority plus urgency and execution signals. */
export function calculateTaskPriority(task = {}, { now = Date.now(), weights = {} } = {}) {
  const explicit = finite(task.priority) ? Math.max(0, Math.min(100, task.priority)) : 0;
  const urgency = deadlineScore(task, now);
  const dependency = Array.isArray(task.dependencies) && task.dependencies.length ? 3 : 0;
  const blocked = ['blocked', 'failed'].includes(task.status) ? -10 : 0;
  const waiting = ['queued', 'running', 'in_progress'].includes(task.status) ? 2 : 0;
  const score = explicit * (finite(weights.explicit) ? weights.explicit : 1) + urgency * (finite(weights.urgency) ? weights.urgency : 1) + dependency + blocked + waiting;
  return Number(score.toFixed(4));
}

export function rankTasksByPriority(tasks = [], options = {}) {
  return [...(Array.isArray(tasks) ? tasks : [])].map((task, index) => ({ task, score: calculateTaskPriority(task, options), index })).sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.task);
}
export const rankTasks = rankTasksByPriority;
export const prioritizeTasks = rankTasksByPriority;
export const rankByPriority = rankTasksByPriority;
export const calculatePriority = calculateTaskPriority;
export const intelligentPriority = calculateTaskPriority;

/** Build project/agent usage reports from persisted task records. */
export function summarizeResourceUsage({ projects = [], projectBudgets = {}, agentBudgets = {}, warningThreshold = 0.8 } = {}) {
  const tracker = createBudgetTracker({ projectBudgets, agentBudgets, warningThreshold });
  for (const project of Array.isArray(projects) ? projects : []) {
    const projectId = id(project?.id);
    if (projectId && (project.budget || project.resourceBudget)) tracker.configureProject(projectId, project.budget || project.resourceBudget);
    for (const task of Array.isArray(project?.tasks) ? project.tasks : []) {
      const agentId = id(task.assignedAgent || task.agentId);
      const inference = task.inference && typeof task.inference === 'object' ? task.inference : {};
      const start = Date.parse(task.startedAt || '');
      const end = Date.parse(task.endedAt || '');
      const durationMs = finite(inference.durationMs) ? inference.durationMs : (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined);
      const retries = integer(task.retryCount) ? task.retryCount : (integer(task.attempts) ? task.attempts : 0);
      tracker.record({ projectId, agentId, usage: inference.usage || {}, durationMs, retries });
    }
  }
  return tracker.snapshot();
}
export const resourceSnapshot = summarizeResourceUsage;

