import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentMetadata, allowedToolsForRole, agentMemoryNamespace, TOOL_REGISTRY } from '../intelligence.js';
import { createContextEnvelope, isolateContext, normalizeBrainMetadata } from '../quality-metrics.js';
test('stage6 brain metadata is truthful and role-scoped',()=>{const b=buildAgentMetadata('developer',{provider:'ollama',model:'qwen',verified:false,projectId:'p1',budget:{tokenBudget:100}});assert.equal(b.executionStatus,'unverified');assert.equal(b.model.provider,'ollama');assert.equal(b.budget.tokenBudget,100);assert.ok(b.allowedTools.includes('artifact_write'));assert.ok(!b.allowedTools.includes('publish'));assert.equal(TOOL_REGISTRY.publish.implemented,false);});
test('stage6 context levels isolate agent and project data',()=>{const a=createContextEnvelope({agentId:'developer',projectId:'p1',level:'level1',facts:['x']});assert.ok(isolateContext(a,{agentId:'developer',projectId:'p1'}));assert.equal(isolateContext(a,{agentId:'imam',projectId:'p1'}),null);assert.equal(isolateContext(a,{agentId:'developer',projectId:'p2'}),null);const o=createContextEnvelope({level:'level3',organizationId:'org'});assert.ok(isolateContext(o,{organizationId:'org'}));});
test('stage6 rejects malformed or ownerless context envelopes',()=>{
  assert.throws(()=>createContextEnvelope({projectId:'p1',level:'level1'}),/agentId is required/);
  assert.equal(isolateContext({level:'level1',projectId:'p1',agentId:null},{projectId:'p1'}),null);
  assert.equal(isolateContext({level:'unknown',projectId:'p1'},{projectId:'p1'}),null);
  assert.equal(isolateContext({level:'level2'},{projectId:undefined}),null);
});
test('stage6 metadata normalization preserves explicit status',()=>{const n=normalizeBrainMetadata({agentId:'x',executionStatus:'failed',allowedTools:['model','model'],memoryNamespace:{level1:'agent:x'}});assert.equal(n.executionStatus,'failed');assert.deepEqual(n.allowedTools,['model']);assert.equal(agentMemoryNamespace('x',{projectId:'p'}).level2,'project:p');});
