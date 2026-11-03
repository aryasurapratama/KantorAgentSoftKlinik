import {allowedToolsForRole,TOOL_REGISTRY} from './intelligence.js';
export { normalizeBudget, actualUsage, createBudgetTracker, budgetStatus, checkBudget, recordActualUsage, calculateTaskPriority, rankTasksByPriority, rankTasks, prioritizeTasks, summarizeResourceUsage, resourceSnapshot } from './budget-priority.js';
export { REASONING_PHASES, PROFESSIONAL_SOPS, DEFAULT_BENCHMARKS, createReasoningRun, advanceReasoning, recordExperience, recordError, normalizeEmployeeProfile, improvementRecommendation, createVersionManager, runBenchmark } from './stage8-intelligence.js';
// Small, dependency-free quality and observability helpers.  Kept separate from
// the HTTP server so dashboards and jobs can use the same validation rules.
const finite = value => Number.isFinite(value) && value >= 0;

export function normalizeEmployee(employee = {}) {
  const id = typeof employee.id === 'string' ? employee.id.trim() : '';
  if (!id) throw new TypeError('Employee id is required');
  const tools = Array.isArray(employee.tools) ? [...new Set(employee.tools.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()))] : ['model'];
  const permissions = Array.isArray(employee.permissions)
    ? [...new Set(employee.permissions.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim()))]
    : [];
  return {
    id,
    name: typeof employee.name === 'string' ? employee.name.trim() : id,
    role: typeof employee.role === 'string' ? employee.role.trim() : '',
    department: typeof employee.department === 'string' ? employee.department.trim() : (employee.departmentId || ''),
    description: typeof employee.description === 'string' ? employee.description.trim() : '',
    virtual: employee.virtual === true,
    modelPolicy: typeof employee.modelPolicy === 'string' ? employee.modelPolicy : 'default',
    tools,
    permissions
  };
}

// Produces a stable, dashboard-safe record. Tokens are copied only from provider
// usage; estimates are never presented as actual usage.
export function inferenceMetrics(provenance = {}, now = Date.now()) {
  const started = Date.parse(provenance.startedAt);
  const ended = Date.parse(provenance.endedAt);
  const usage = provenance.usage || provenance;
  const inputTokens = Number.isSafeInteger(usage.inputTokens) ? usage.inputTokens : null;
  const outputTokens = Number.isSafeInteger(usage.outputTokens) ? usage.outputTokens : null;
  return {
    requestId: typeof provenance.requestId === 'string' ? provenance.requestId : null,
    agentId: typeof provenance.agentId === 'string' ? provenance.agentId : null,
    provider: provenance.provider || null,
    model: provenance.reportedModel || provenance.model || null,
    status: typeof provenance.status === 'string' ? provenance.status : 'unknown',
    durationMs: Number.isFinite(started) ? Math.max(0, (Number.isFinite(ended) ? ended : now) - started) : null,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
    failed: ['failed', 'cancelled'].includes(provenance.status),
    error: typeof provenance.error === 'string' ? provenance.error.slice(0, 500) : null
  };
}

export function summarizeMetrics(records = []) {
  const rows = records.map(inferenceMetrics);
  const completed = rows.filter(r => r.status === 'completed');
  const durations = rows.map(r => r.durationMs).filter(finite);
  return {
    requests: rows.length,
    completed: completed.length,
    failures: rows.filter(r => r.failed).length,
    failureRate: rows.length ? rows.filter(r => r.failed).length / rows.length : 0,
    totalTokens: rows.reduce((sum, r) => sum + (r.totalTokens || 0), 0),
    averageDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    records: rows
  };
}

export function validateProjectIsolation(project, expectedProjectId) {
  if (!project || typeof project !== 'object' || typeof expectedProjectId !== 'string' || project.id !== expectedProjectId) return false;
  const nested = [...(project.tasks || []), ...(project.artifacts || []), ...(project.meetings || [])];
  return nested.every(item => !item.projectId || item.projectId === expectedProjectId);
}

export function canUseTool(employee, tool, { projectId, resourceProjectId } = {}) {
  if (!employee || typeof tool !== 'string' || !TOOL_REGISTRY[tool] || TOOL_REGISTRY[tool].implemented !== true) return false;
  const tools=Array.isArray(employee.tools)?employee.tools:allowedToolsForRole(employee.roleId||employee.role);
  if (!tools.includes(tool)) return false;
  if (resourceProjectId !== undefined && resourceProjectId !== projectId) return false;
  return true;
}

// Stage 6 observability and context boundaries. Context is copied, scoped, and
// never inferred from another project or agent.
export const CONTEXT_LEVELS=Object.freeze({level1:'agent',level2:'project',level3:'organization'});
const textId=v=>typeof v==='string'&&v.trim()?v.trim():null;
const normalizeLevel=v=>({1:'level1',2:'level2',3:'level3','1':'level1','2':'level2','3':'level3',level1:'level1',level2:'level2',level3:'level3'}[v]||v);
const listUnique=v=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))]:[];
export function normalizeBrainMetadata(metadata={}) {
  const model=metadata.model&&typeof metadata.model==='object'?metadata.model:{};
  const reasoning=metadata.reasoning&&typeof metadata.reasoning==='object'?metadata.reasoning:{};
  const budget=metadata.budget&&typeof metadata.budget==='object'?metadata.budget:{};
  return {
    agentId:textId(metadata.agentId),
    model:{provider:textId(model.provider),id:textId(model.id||model.model),policy:textId(model.policy)||'default'},
    reasoning:{mode:textId(reasoning.mode)||'general',effort:textId(reasoning.effort),maxTokens:Number.isFinite(reasoning.maxTokens)?Math.max(0,reasoning.maxTokens):null},
    capabilities:listUnique(metadata.capabilities),allowedTools:listUnique(metadata.allowedTools),memoryNamespace:metadata.memoryNamespace&&typeof metadata.memoryNamespace==='object'?{level1:textId(metadata.memoryNamespace.level1),level2:textId(metadata.memoryNamespace.level2),level3:textId(metadata.memoryNamespace.level3)}:{level1:null,level2:null,level3:null},budget:{tokenBudget:Number.isFinite(budget.tokenBudget)?Math.max(0,budget.tokenBudget):null,durationBudgetMs:Number.isFinite(budget.durationBudgetMs)?Math.max(0,budget.durationBudgetMs):null},executionStatus:textId(metadata.executionStatus)||'unknown'
  };
}
export function createContextEnvelope({agentId,projectId,organizationId='workspace',level='level2',facts=[],assumptions=[],decisions=[],input}={}) {
  level=normalizeLevel(level);
  if(!['level1','level2','level3'].includes(level)) throw new TypeError('Context level is invalid');
  const aid=textId(agentId),pid=textId(projectId),oid=textId(organizationId)||'workspace';
  if(level==='level1'&&!aid) throw new TypeError('agentId is required for agent context');
  if(level!=='level3'&&!pid) throw new TypeError('projectId is required for project or agent context');
  const values={facts:listUnique(facts),assumptions:listUnique(assumptions),decisions:listUnique(decisions)};
  if(level==='level1') return Object.freeze({level,scope:`agent:${aid||'unknown'}:project:${pid}`,agentId:aid,projectId:pid,organizationId:oid,values,input:input===undefined?null:structuredClone(input)});
  if(level==='level2') return Object.freeze({level,scope:`project:${pid}`,agentId:null,projectId:pid,organizationId:oid,values,input:input===undefined?null:structuredClone(input)});
  return Object.freeze({level,scope:`organization:${oid}`,agentId:null,projectId:null,organizationId:oid,values,input:input===undefined?null:structuredClone(input)});
}
export function isolateContext(context,{agentId,projectId,organizationId='workspace',level='level2'}={}) {
  if(!context||typeof context!=='object') return null;
  level=normalizeLevel(context.level||level);
  if(!['level1','level2','level3'].includes(level)) return null;
  const aid=textId(agentId),pid=textId(projectId),oid=textId(organizationId)||'workspace';
  const contextAgent=textId(context.agentId),contextProject=textId(context.projectId),contextOrg=textId(context.organizationId);
  // Reject malformed persisted envelopes instead of treating missing IDs as a
  // shared namespace. Agent memory must always name its owning agent.
  if(level==='level1'&&(!contextAgent||!aid||contextAgent!==aid||!contextProject||!pid||contextProject!==pid)) return null;
  if(level==='level2'&&(!contextProject||!pid||contextProject!==pid)) return null;
  if(level==='level3'&&(!contextOrg||contextOrg!==oid)) return null;
  return structuredClone(context);
}
export const buildContextEnvelope=createContextEnvelope;
export const isolateAgentContext=isolateContext;
export function validateContextIsolation(context,{agentId,projectId,organizationId='workspace'}={}) { return Boolean(isolateContext(context,{agentId,projectId,organizationId,level:context?.level})); }

// Compatibility aliases for consumers that describe the same Stage 6 contract
export const contextIsolation=Object.freeze({create:createContextEnvelope,filter:isolateContext,validate:validateContextIsolation});
export const isolateProjectContext=(context,projectId)=>isolateContext(context,{projectId,level:'level2'});
