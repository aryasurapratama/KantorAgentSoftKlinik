import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createOfficeWorkflow} from '../office-workflow.js';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stage5-'));const w=createOfficeWorkflow({dataDir:dir,ask:async()=> 'ok'});await w.init();t.after(()=>w.close().then(()=>fs.rm(dir,{recursive:true,force:true})));return {w,dir};}
test('stage5 task contract and resumable query',async t=>{const {w}=await fixture(t);const p=await w.create({instruction:'general report'});const task=await w.createTask(p.id,{assignedAgent:'director',objective:'plan',requirements:['facts'],dependencies:['upstream'],expectedOutputs:['report'],acceptanceCriteria:['review'],priority:5});assert.equal(task.assignedAgent,'director');assert.deepEqual(task.dependencies,['upstream']);assert.ok(Array.isArray(w.findResumableProjects({query:'general'})));assert.ok(Array.isArray(w.queryProjects({query:'general'})));});
test('stage5 collaboration persists and project memory isolated',async t=>{const {w}=await fixture(t);const a=await w.create({instruction:'alpha'}),b=await w.create({instruction:'beta'});await w.recordCollaboration(a.id,{from:'director',to:'developer',objective:'delegate'});const snap=w.snapshot();assert.equal(snap.projects.find(x=>x.id===a.id).collaboration.length,1);assert.equal(snap.projects.find(x=>x.id===b.id).collaboration.length,0);});
test('stage5 recovery normalizes persisted running tasks',async t=>{const {w,dir}=await fixture(t);const p=await w.create({instruction:'recover'});await w.close();const raw=JSON.parse(await fs.readFile(path.join(dir,'operations.json')));raw.projects[0].tasks=[{id:'00000000-0000-0000-0000-000000000001',key:'legacy',status:'running'}];await fs.writeFile(path.join(dir,'operations.json'),JSON.stringify(raw));const w2=createOfficeWorkflow({dataDir:dir,ask:async()=> 'ok'});await w2.init();const task=w2.snapshot().projects[0].tasks[0];assert.equal(task.status,'queued');assert.ok('completionEvidence' in task);await w2.close();});


