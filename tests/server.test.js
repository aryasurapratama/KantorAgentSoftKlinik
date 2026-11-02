import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
async function request(port,url,body,method='POST',origin){const headers={'content-type':'application/json'};if(origin)headers.origin=origin;const response=await fetch(`http://127.0.0.1:${port}/api/${url}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();return {status:response.status,body:text?JSON.parse(text):{}};}
async function waitFor(fn,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,30));}throw new Error('timeout');}
async function start(port,dataDir){const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dataDir},cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);try{await waitFor(async()=>{if(child.exitCode!==null)throw new Error(`backend exited: ${errors}`);try{return (await request(port,'health',undefined,'GET')).body.ok;}catch{return false;}});}catch(error){child.kill();throw error;}return child;}
async function stop(child){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}

test('backend integration: validation, AI, queues, persistence',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-test-'));
 let active=0,maxActive=0;const requests=[];
 const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;res.setHeader('content-type','application/json');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'qwen2.5:3b'}]}));return;}const body=JSON.parse(raw);requests.push(body);active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,35));res.end(JSON.stringify({message:{content:`jawaban-${requests.length}`}}));active--;});
 const mockPort=await listen(mock);const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 try{
  backend=await start(port,dataDir);
  assert.equal((await request(port,'health',undefined,'GET')).body.ok,true);
  const roster=(await request(port,'state',undefined,'GET')).body.agents;
  assert.equal(roster.length,35);assert.equal(new Set(roster.map(a=>a.id)).size,35);assert.equal(roster.find(a=>a.id==='marketing').role,'System Analyst');
  assert.equal(roster.filter(a=>a.virtual).length,22);assert.equal(roster.filter(a=>!a.virtual).length,13);assert.ok(roster.every(a=>a.departmentId&&a.department&&!a.prompt));
  await request(port,'settings',{baseUrl:`http://127.0.0.1:${mockPort}`,model:'qwen2.5:3b'},'PUT');
  assert.equal((await request(port,'connection/test',{})).body.ok,true);
  await request(port,'settings',{model:'missing:3b'},'PUT');assert.equal((await request(port,'connection/test',{})).body.ok,false);
  const saved=await request(port,'settings',{model:'qwen2.5:3b',apiKey:'secret-value'},'PUT');assert.equal(saved.body.apiKey,undefined);assert.equal(saved.body.hasApiKey,true);
  const connector=await request(port,'integrations',{id:'github-main',type:'github',name:'GitHub utama',baseUrl:'https://api.github.com',scopes:['read:user'],token:'github-secret'},'POST');
  assert.equal(connector.status,201);assert.equal(connector.body.connector.connected,true);assert.equal(connector.body.connector.token,undefined);
  const integrations=await request(port,'integrations',undefined,'GET');assert.equal(integrations.status,200);assert.ok(integrations.body.providers.some(p=>p.id==='github'));assert.ok(integrations.body.providers.some(p=>p.id==='telegram'));assert.equal(integrations.body.connections[0].connected,true);
  assert.equal((await request(port,'integrations/telegram/connect',{token:'invalid'})).status,400);
  assert.equal((await request(port,'integrations/github-main/approval',{approved:false})).status,400);assert.equal((await request(port,'integrations/github-main/approval',{approved:true})).body.ok,true);
  assert.equal((await request(port,'integrations/github-main',undefined,'DELETE')).status,204);
  for(const agentId of ['bad','__proto__','constructor','department:bad']){
   assert.equal((await request(port,'tasks',{title:'x',agentId})).status,400);
   assert.equal((await request(port,'chat',{message:'x',agentId})).status,400);
  }
  assert.equal((await request(port,'tasks',{title:'x'},'POST','https://evil.example')).status,403);
  assert.equal((await request(port,'tasks',{title:''})).status,400);
  assert.equal((await request(port,'settings',{baseUrl:'http://example.com'},'PUT')).status,400);
  const chatRequest=request(port,'chat',{agentId:'admin',message:'uji admin'});
  const officeWorking=await waitFor(async()=>{const office=(await request(port,'office-state',undefined,'GET')).body;return office.team.find(a=>a.id==='admin')?.state==='bekerja'?office:null;});
  assert.equal(officeWorking.stats.active,1);assert.equal(officeWorking.ketua.state,'santai');assert.equal(officeWorking.settings,undefined);
  const firstChat=await chatRequest;assert.equal(firstChat.status,200);assert.equal(firstChat.body.message.role,'assistant');assert.match(firstChat.body.message.content,/jawaban/);
  assert.equal((await request(port,'office-state',undefined,'GET')).body.stats.active,0);
  await request(port,'chat',{agentId:'admin',message:'lanjutan'});assert.ok(requests.at(-1).messages.some(m=>m.content==='uji admin'));assert.ok(requests.at(-1).messages.some(m=>m.role==='assistant'));
  const a=await request(port,'tasks',{title:'Satu',description:'detail satu',agentId:'admin'});assert.equal(a.status,202);
  const b=await request(port,'tasks',{title:'Dua',description:'detail dua',agentId:'team'});assert.equal(b.status,202);
  const concurrentChat=request(port,'chat',{agentId:'marketing',message:'pesan bersamaan'});
  const state=await waitFor(async()=>{const s=(await request(port,'state',undefined,'GET')).body;return s.tasks.every(t=>t.status==='completed')?s:null;},60000);
  assert.equal((await concurrentChat).status,200);assert.equal(maxActive,1);
  const single=state.tasks.find(t=>t.id===a.body.task.id);const team=state.tasks.find(t=>t.id===b.body.task.id);
  assert.equal(single.steps.length,1);assert.equal(team.steps.length,5);assert.ok(team.steps.every(s=>s.status==='completed'&&s.content&&s.startedAt&&s.endedAt));assert.equal(team.result,team.steps.at(-1).content);
  const singleIndex=requests.findIndex(r=>r.messages.some(m=>m.content.includes('detail satu')));const teamIndex=requests.findIndex(r=>r.messages.some(m=>m.content.includes('detail dua')));assert.ok(singleIndex<teamIndex);
  assert.ok(requests.at(-1).messages.some(m=>m.content.includes('detail dua')));
  assert.equal(state.settings.apiKey,undefined);
  const specialist=await request(port,'chat',{agentId:'wibisono',message:'rancang animasi ringan'});
  assert.equal(specialist.status,200);assert.match(requests.at(-1).messages[0].content,/Motion Designer/);
  assert.equal(requests.at(-1).options.num_ctx,4096);assert.equal(requests.at(-1).options.num_thread,4);
  const specialistTask=await request(port,'tasks',{title:'Uji QA',agentId:'imam'});assert.equal(specialistTask.status,202);
  await waitFor(async()=>{const s=(await request(port,'state',undefined,'GET')).body;return s.tasks.find(t=>t.id===specialistTask.body.task.id)?.status==='completed';});
  assert.match(requests.at(-1).messages[0].content,/Quality Assurance/);
  const video=await request(port,'chat',{agentId:'video_editor',message:'Rancang edit video demo 30 detik'});
  assert.equal(video.status,200);assert.match(requests.at(-1).messages[0].content,/edit decision list/);assert.match(requests.at(-1).messages[0].content,/jangan mengaku merender/);
  const departmentTask=await request(port,'tasks',{title:'Produksi video',agentId:'department:creative'});assert.equal(departmentTask.status,202);
  const department=await waitFor(async()=>{const s=(await request(port,'state',undefined,'GET')).body;const t=s.tasks.find(t=>t.id===departmentTask.body.task.id);return t?.status==='completed'?t:null;});
  assert.equal(department.steps.length,5);assert.ok(department.steps.some(s=>s.agentId==='video_editor'));assert.ok(department.steps.every(s=>roster.find(a=>a.id===s.agentId)?.departmentId==='creative'));assert.equal(maxActive,1);
  assert.equal(department.result,department.steps.at(-1).content);
  await stop(backend);backend=await start(port,dataDir);
  const restored=(await request(port,'state',undefined,'GET')).body;assert.equal(restored.tasks.length,4);assert.equal(restored.messages.length,10);assert.equal(restored.settings.hasApiKey,true);assert.equal(restored.settings.apiKey,undefined);
 }finally{if(backend?.exitCode===null)await stop(backend);mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await fs.rm(dataDir,{recursive:true,force:true});}
});
