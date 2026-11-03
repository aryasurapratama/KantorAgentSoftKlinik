import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_PROFILES,selectModel,verifyModelResponse,buildAgentSystemPrompt} from '../intelligence.js';
test('all role profiles complete',()=>{const keys=['identity','profession','skills','standards','boundaries','method','output','validation','collaboration','finish'];assert.equal(Object.keys(ROLE_PROFILES).length,35);for(const p of Object.values(ROLE_PROFILES))for(const k of keys)assert.ok(p[k]!==undefined&&((Array.isArray(p[k])&&p[k].length)||(!Array.isArray(p[k])&&String(p[k]).length)));});
test('model policy selects role model',()=>{assert.equal(selectModel('developer',{models:{coding:'coder'}}),'coder');assert.equal(selectModel('copywriter',{model:'fallback',models:{}}),'fallback');});
test('verification requires provenance',()=>{assert.equal(verifyModelResponse('ok',{model:'m',status:'completed'}).verified,true);assert.equal(verifyModelResponse('ok',{}).verified,false);assert.equal(verifyModelResponse('not empty',{status:'failed',model:'m'}).verified,false);});
test('system prompt includes role controls',()=>{const s=buildAgentSystemPrompt('imam','CTX');assert.match(s,/IDENTITAS/);assert.match(s,/VALIDASI/);assert.match(s,/CTX/);});
