import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createApiSecurity } from '../api-security.js';
import { createStorage } from '../storage.js';

async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
const sessions=new Map();
async function bootstrap(port){const response=await fetch(`http://127.0.0.1:${port}/api/session`,{headers:{'x-harmes-bootstrap':'1'}});assert.equal(response.status,200);const body=await response.json();const cookie=response.headers.get('set-cookie').split(';')[0];sessions.set(port,{cookie,csrfToken:body.csrfToken});return sessions.get(port);}
async function request(port,url,body,method='POST',origin){const session=sessions.get(port);const headers={'content-type':'application/json',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{})};if(origin)headers.origin=origin;const response=await fetch(`http://127.0.0.1:${port}/api/${url}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();return {status:response.status,body:text?JSON.parse(text):{}};}
async function waitFor(fn,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,30));}throw new Error('timeout');}
async function start(port,dataDir,extraEnv={}){sessions.delete(port);const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dataDir,API_TOKEN:'',...extraEnv},cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);try{await waitFor(async()=>{if(child.exitCode!==null)throw new Error(`backend exited: ${errors}`);try{return (await request(port,'health',undefined,'GET')).body.ok;}catch{return false;}});await bootstrap(port);}catch(error){child.kill();throw error;}return child;}
async function stop(child){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}

test('API Host allowlist rejects URL syntax in HTTP authority',()=>{
 const {validHost}=createApiSecurity({port:4318});
 for(const host of ['127.0.0.1:4318','localhost:4318','[::1]:4318'])assert.equal(validHost(host),true);
 for(const host of ['evil.example:4318','127.0.0.1:4318?x=1','127.0.0.1:4318#fragment','127.0.0.1:4318/','user@127.0.0.1:4318','127.0.0.1:4319',undefined])assert.equal(validHost(host),false);
});

test('configured reverse proxy host and origin are accepted',()=>{
 const previousHosts=process.env.API_ALLOWED_HOSTS, previousOrigins=process.env.API_ALLOWED_ORIGINS;
 process.env.API_ALLOWED_HOSTS='app.example.com';process.env.API_ALLOWED_ORIGINS='https://app.example.com';
 try {
  const {middleware,validHost,validOrigin}=createApiSecurity({port:4318});
  assert.equal(validHost('app.example.com'),true);assert.equal(validOrigin('https://app.example.com'),true);
  let next=false;const res={status(){return this;},json(){return this;},set(){return this;}};
  middleware({path:'/app',method:'GET',headers:{host:'app.example.com',origin:'https://app.example.com'}},res,()=>{next=true;});
  assert.equal(next,true);
 } finally {
  if(previousHosts===undefined)delete process.env.API_ALLOWED_HOSTS;else process.env.API_ALLOWED_HOSTS=previousHosts;
  if(previousOrigins===undefined)delete process.env.API_ALLOWED_ORIGINS;else process.env.API_ALLOWED_ORIGINS=previousOrigins;
 }
});

test('browser policy blocks untrusted scripts, remote media, devices and framing',()=>{
 const policies=dev=>{
  const {middleware}=createApiSecurity({port:4318,dev,scriptHashes:["'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='","'unsafe-inline'"]});
  const headers={};middleware({path:'/index.html',method:'GET',headers:{host:'127.0.0.1:4318'}},{set(key,value){headers[key.toLowerCase()]=value;}},()=>{});return headers;
 };
 const headers=policies(false),policy=headers['content-security-policy'];
 assert.match(policy,/script-src 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='/);
 assert.doesNotMatch(policy.match(/script-src [^;]+/)[0],/unsafe-inline|unsafe-eval/);
 assert.match(policy,/img-src 'self' data: blob:/);assert.match(policy,/connect-src 'self';/);
 assert.match(policy,/object-src 'none'/);assert.match(policy,/base-uri 'none'/);assert.match(policy,/frame-ancestors 'self'/);
 assert.equal(headers['cross-origin-resource-policy'],'same-origin');assert.match(headers['permissions-policy'],/camera=\(\), microphone=\(\)/);
 assert.match(policies(true)['content-security-policy'],/connect-src 'self' ws:\/\/127\.0\.0\.1:5173/);
});

test('mutation limiter covers valid sessions and cannot be reset with fresh sessions',()=>{
 const {middleware}=createApiSecurity({port:4318});
 const invoke=(path,method='GET',headers={})=>{let next=false;const res={headers:{},code:200,set(key,value){this.headers[key.toLowerCase()]=value;return this;},status(code){this.code=code;return this;},json(value){this.body=value;return this;},sendStatus(code){this.code=code;return this;}};middleware({path,method,headers:{host:'127.0.0.1:4318',...headers}},res,()=>{next=true;});return {...res,next};};
 const session=()=>{const bootstrap=invoke('/api/session','GET',{'x-harmes-bootstrap':'1'});return {cookie:bootstrap.headers['set-cookie'].split(';')[0],'x-csrf-token':bootstrap.body.csrfToken};};
 const first=session();for(let i=0;i<120;i++)assert.equal(invoke('/api/tasks','POST',first).next,true);
 assert.equal(invoke('/api/tasks','POST',first).code,429);
 const second=session();for(let i=0;i<119;i++)assert.equal(invoke('/api/tasks','POST',second).next,true);
 assert.equal(invoke('/api/tasks','POST',session()).code,429);
 assert.equal(invoke('/api/state','GET',first).next,true,'polling remains available');
});

test('GitHub OAuth validates callbacks, scopes, cancellation and one-use state offline',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-oauth-'));
 const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 const clientSecret='offline-client-secret';
 try{
  backend=await start(port,dataDir,{GITHUB_CLIENT_ID:'offline-client-id',GITHUB_CLIENT_SECRET:clientSecret});
  const raw=(url,options={})=>fetch(`http://127.0.0.1:${port}/api/${url}`,options);
  assert.equal((await raw('state')).status,401);
  assert.equal((await raw('session')).status,403);
  assert.equal((await raw('session',{headers:{origin:'https://evil.example','x-harmes-bootstrap':'1'}})).status,403);
  const badHost=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,path:'/api/health',headers:{host:`evil.example:${port}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(badHost,403);
  assert.equal((await raw('state',{headers:{cookie:sessions.get(port).cookie,origin:'https://evil.example'}})).status,403);
  for(const csrfToken of [undefined,'incorrect']){
   const response=await raw('settings',{method:'PUT',headers:{'content-type':'application/json',cookie:sessions.get(port).cookie,...(csrfToken?{'x-csrf-token':csrfToken}:{})},body:JSON.stringify({businessName:'CSRF overwrite'})});assert.equal(response.status,403);
  }
  assert.notEqual((await request(port,'settings',undefined,'GET')).body.businessName,'CSRF overwrite');
  const authorize=redirectUri=>request(port,`integrations/github/authorize?redirectUri=${encodeURIComponent(redirectUri)}`,undefined,'GET');
  for(const redirectUri of [`https://evil.example/api/integrations/github/callback`,`http://127.0.0.1:${port}/wrong-path`,`http://127.0.0.1:${port}/api/integrations/github/callback?next=evil`,`http://user@127.0.0.1:${port}/api/integrations/github/callback`,`http://127.0.0.1:${port===4319?4320:4319}/api/integrations/github/callback`])assert.equal((await authorize(redirectUri)).status,400);
  const result=await authorize(`http://localhost:${port}/api/integrations/github/callback`);
  assert.equal(result.status,200);assert.deepEqual(result.body.scopes,['read:user']);
  const url=new URL(result.body.url);assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('client_id'),'offline-client-id');assert.equal(url.searchParams.get('scope'),'read:user');assert.equal(url.searchParams.get('state'),result.body.state);assert.ok(!JSON.stringify(result.body).includes(clientSecret));
  const callback=query=>fetch(`http://127.0.0.1:${port}/api/integrations/github/callback?${query}`);
  const invalid=await callback('state=invalid&code=not-sent');assert.equal(invalid.status,400);const invalidHtml=await invalid.text();assert.match(invalidHtml,/Sesi OAuth/);const nonce=invalidHtml.match(/<script nonce="([^"]+)"/)[1];assert.ok(invalid.headers.get('content-security-policy').includes(`script-src 'nonce-${nonce}'`));assert.equal(invalid.headers.get('x-powered-by'),null);
  const cancelled=await callback(`state=${result.body.state}&error=access_denied&error_description=${encodeURIComponent('</script>cancelled')}`);assert.equal(cancelled.status,400);const html=await cancelled.text();assert.ok(!html.includes('</script>cancelled'));assert.ok(!html.includes(clientSecret));assert.match(html,/\\u003c\/script>cancelled/);
  const replay=await callback(`state=${result.body.state}&code=not-sent`);assert.equal(replay.status,400);assert.match(await replay.text(),/Sesi OAuth/);
  const missingCode=await authorize(`http://127.0.0.1:${port}/api/integrations/github/callback`);const missing=await callback(`state=${missingCode.body.state}`);assert.equal(missing.status,400);assert.match(await missing.text(),/kode akses/);assert.equal((await callback(`state=${missingCode.body.state}&error=access_denied`)).status,400);
  const preflight=await fetch(`http://127.0.0.1:${port}/api/integrations/example`,{method:'OPTIONS',headers:{origin:`http://localhost:${port}`,'access-control-request-method':'DELETE'}});assert.equal(preflight.status,204);assert.ok(preflight.headers.get('access-control-allow-methods').split(',').includes('DELETE'));
  assert.equal((await request(port,'integrations',undefined,'GET')).body.connectors.length,0);
 }finally{if(backend?.exitCode===null)await stop(backend);await fs.rm(dataDir,{recursive:true,force:true});}
});

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
  const saved=await request(port,'settings',{model:'qwen2.5:3b',apiKey:'secret-value'},'PUT');assert.equal(saved.body.apiKey,undefined);assert.equal(saved.body.hasApiKey,false);
  const connector=await request(port,'integrations',{id:'github-main',type:'github',name:'GitHub utama',baseUrl:'https://api.github.com',scopes:['read:user'],token:'github-secret'},'POST');
  assert.equal(connector.status,201);assert.equal(connector.body.connector.connected,true);assert.equal(connector.body.connector.token,undefined);
  const integrations=await request(port,'integrations',undefined,'GET');assert.equal(integrations.status,200);assert.ok(integrations.body.providers.some(p=>p.id==='github'));assert.ok(integrations.body.providers.some(p=>p.id==='telegram'));assert.equal(integrations.body.connections[0].connected,true);
  assert.equal((await request(port,'integrations/telegram/connect',{token:'invalid'})).status,400);
  assert.equal((await request(port,'integrations/github-main/approval',{approved:false})).status,400);assert.equal((await request(port,'integrations/github-main/approval',{approved:true})).status,400);
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
  assert.equal(single.steps.length,1);assert.equal(team.steps.length,6);assert.equal(team.steps.at(-1).agentId,'director');assert.ok(team.steps.every(s=>s.status==='completed'&&s.content&&s.startedAt&&s.endedAt));assert.equal(team.result,team.steps.at(-1).content);
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
  const credential=await request(port,'settings',{provider:'openai-compatible',baseUrl:'https://api.openai.com/v1',model:'offline-model',apiKey:'offline-persisted-secret'},'PUT');assert.equal(credential.status,200);assert.equal(credential.body.hasApiKey,true);assert.equal(credential.body.apiKey,undefined);assert.equal(credential.body.apiKeyOrigin,undefined);
  await stop(backend);backend=await start(port,dataDir);
  const restored=(await request(port,'state',undefined,'GET')).body;assert.equal(restored.tasks.length,4);assert.equal(restored.messages.length,10);assert.equal(restored.settings.hasApiKey,true);assert.equal(restored.settings.apiKey,undefined);
  const changedOrigin=await request(port,'settings',{baseUrl:'https://openrouter.ai/api/v1'},'PUT');assert.equal(changedOrigin.status,200);assert.equal(changedOrigin.body.hasApiKey,false);
 }finally{if(backend?.exitCode===null)await stop(backend);mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await fs.rm(dataDir,{recursive:true,force:true});}
});

test('security regressions: credentials stay bound, updates persist, chat rollback and task cancellation',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-regressions-'));
 const observed=[];let failChat=true;let slowCalls=0;
 const mock=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
  observed.push({url:req.url,authorization:req.headers.authorization,body});res.setHeader('content-type','application/json');
  if(req.url==='/models'){res.end(JSON.stringify({data:[{id:'offline-model'}]}));return;}
  if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'offline-model'}]}));return;}
  const prompt=body.messages?.at(-1)?.content||'';
  if(prompt==='uji kegagalan'&&failChat){failChat=false;res.statusCode=503;res.end(JSON.stringify({error:'synthetic provider failure'}));return;}
  if(prompt.includes('Tugas: lambat')&&++slowCalls===1)await new Promise(resolve=>setTimeout(resolve,2500));
  res.end(JSON.stringify({message:{content:'hasil sintetis'},choices:[{message:{content:'hasil sintetis'}}]}));
 });
 const secondMock=http.createServer((req,res)=>{observed.push({url:req.url,authorization:req.headers.authorization,second:true});res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'offline-model'}]}));});
 const mockPort=await listen(mock),secondPort=await listen(secondMock);const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 try{
  backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1',AI_API_KEY:'environment-never-forwarded',AI_API_KEY_ORIGIN:'https://api.openai.com'});
  assert.equal((await request(port,'settings',{provider:'openai-compatible',baseUrl:'https://untrusted.invalid/v1',model:'offline-model',apiKey:'do-not-save'},'PUT')).status,400);
  assert.equal((await request(port,'settings',{provider:'ollama',baseUrl:'https://untrusted.invalid',model:'offline-model'},'PUT')).status,400);
  assert.equal((await request(port,'settings',{provider:'openai-compatible',baseUrl:`http://127.0.0.1:${mockPort}`,model:'offline-model',apiKey:'synthetic-bound-key'},'PUT')).status,200);
  assert.equal((await request(port,'connection/test',{})).body.ok,true);assert.equal(observed.at(-1).authorization,'Bearer synthetic-bound-key');
  assert.equal((await request(port,'settings',{baseUrl:`http://127.0.0.1:${secondPort}`},'PUT')).body.hasApiKey,false);
  assert.equal((await request(port,'connection/test',{})).body.ok,true);assert.equal(observed.at(-1).second,true);assert.equal(observed.at(-1).authorization,undefined);
  await request(port,'settings',{provider:'ollama',baseUrl:`http://127.0.0.1:${mockPort}`},'PUT');
  assert.equal((await request(port,'connection/test',{})).body.ok,true);assert.equal(observed.at(-1).authorization,undefined,'Ollama receives no stored or environment key');
  const [business,connector]=await Promise.all([
   request(port,'settings',{businessName:'Concurrent business'},'PUT'),
   request(port,'integrations',{id:'concurrent-github',type:'github',name:'Concurrent GitHub',baseUrl:'https://api.github.com',token:'synthetic-connector-token'})
  ]);assert.equal(business.status,200);assert.equal(connector.status,201);
  const disk=await (await createStorage({dataDir})).readSettings({});assert.equal(disk.businessName,'Concurrent business');assert.equal(disk.integrations['concurrent-github'].token,'synthetic-connector-token');
  assert.ok(!(await fs.readFile(path.join(dataDir,'settings.json'),'utf8')).includes('synthetic-connector-token'));
  assert.equal((await request(port,'chat',{agentId:'admin',message:'uji kegagalan',requestId:'failed_chat_retry_01'})).status,503);
  assert.equal((await request(port,'state',undefined,'GET')).body.messages.length,0);
  assert.equal((await request(port,'chat',{agentId:'admin',message:'uji kegagalan',requestId:'failed_chat_retry_01'})).status,200);
  assert.equal((await request(port,'state',undefined,'GET')).body.messages.filter(m=>m.role==='user').length,1);
  const first=(await request(port,'tasks',{title:'lambat',agentId:'admin'})).body.task;
  await waitFor(()=>observed.some(r=>r.body?.messages?.at(-1)?.content?.includes('Tugas: lambat')));
  const queued=(await request(port,'tasks',{title:'antrean',agentId:'admin'})).body.task;
  assert.equal((await request(port,`tasks/${queued.id}/cancel`,{})).body.task.status,'cancelled');
  assert.equal((await request(port,`tasks/${first.id}/cancel`,{})).body.task.status,'cancelled');
  assert.equal((await request(port,`tasks/${first.id}/retry`,{})).status,202);
  await waitFor(async()=>{const current=(await request(port,'state',undefined,'GET')).body;return current.tasks.find(t=>t.id===first.id)?.status==='completed';});
  const afterRetry=(await request(port,'state',undefined,'GET')).body;assert.equal(afterRetry.tasks.length,2);assert.equal(afterRetry.tasks.find(t=>t.id===queued.id).status,'cancelled');
  assert.equal((await request(port,`tasks/${first.id}/retry`,{})).status,409);
  const backup=(await request(port,'backup',undefined,'GET')).body;assert.equal(backup.settings,undefined);assert.equal(backup.integrations,undefined);assert.ok(!JSON.stringify(backup).includes('synthetic-connector-token'));
  assert.equal((await request(port,'backup/restore',{approved:false,backup})).status,400);
  assert.equal((await request(port,'backup/restore',{approved:true,backup:{...backup,tasks:[{...backup.tasks[0],agentId:'unknown'}]}})).status,400);
  assert.equal((await request(port,'backup/restore',{approved:true,backup:{...backup,tasks:[{...backup.tasks[0],scheduledAt:'not-a-date'}]}})).status,400);
  assert.equal((await request(port,`tasks/${first.id}`,undefined,'DELETE')).status,204);
  assert.equal((await request(port,'messages?agentId=admin',undefined,'DELETE')).status,204);
  assert.equal((await request(port,'backup/restore',{approved:true,backup})).status,200);
  const restored=(await request(port,'state',undefined,'GET')).body;assert.equal(restored.tasks.length,2);assert.equal(restored.messages.length,2);
  await stop(backend);backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1'});
  assert.equal((await request(port,'settings',undefined,'GET')).body.businessName,'Concurrent business');
 }finally{if(backend?.exitCode===null)await stop(backend);for(const server of [mock,secondMock]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await fs.rm(dataDir,{recursive:true,force:true});}
});

test('startup retention bounds archived tasks, messages and activity',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-retention-'));const createdAt=new Date().toISOString();
 const tasks=Array.from({length:510},(_,index)=>({id:`task-${index}`,agentId:'admin',title:`Archive ${index}`,description:'',status:'completed',createdAt,updatedAt:createdAt,steps:[]}));
 const messages=Array.from({length:2002},(_,index)=>({id:`message-${index}`,agentId:'admin',role:index%2?'assistant':'user',content:`Message ${index}`,createdAt}));
 const activity=Array.from({length:101},(_,index)=>({id:`activity-${index}`,title:'Synthetic',detail:'',type:'task',createdAt}));
 await fs.writeFile(path.join(dataDir,'state.json'),JSON.stringify({schemaVersion:1,tasks,messages,activity}));
 const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 try{backend=await start(port,dataDir);const current=(await request(port,'state',undefined,'GET')).body;assert.equal(current.tasks.length,500);assert.equal(current.messages.length,2000);assert.equal(current.messages[0].id,'message-2');assert.equal(current.activity.length,100);const disk=JSON.parse(await fs.readFile(path.join(dataDir,'state.json'),'utf8'));assert.equal(disk.tasks.length,500);assert.equal(disk.messages.length,2000);}
 finally{if(backend?.exitCode===null)await stop(backend);await fs.rm(dataDir,{recursive:true,force:true});}
});

test('9router settings survive restart and malformed backups cannot break workspace records',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-schema-'));
 const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 try{
  const env={AI_ALLOW_LOCAL_COMPATIBLE:'1'};
  backend=await start(port,dataDir,env);
  const configured=await request(port,'settings',{provider:'9router',baseUrl:'http://127.0.0.1:20128/v1',model:'test-router-model',businessName:'Retained business',apiKey:'router-persisted-secret'},'PUT');
  assert.equal(configured.status,200);assert.equal(configured.body.hasApiKey,true);
  await stop(backend);backend=await start(port,dataDir,env);
  const settings=(await request(port,'settings',undefined,'GET')).body;
  assert.equal(settings.provider,'9router');assert.equal(settings.baseUrl,'http://127.0.0.1:20128/v1');assert.equal(settings.model,'test-router-model');assert.equal(settings.businessName,'Retained business');assert.equal(settings.hasApiKey,true);
  const createdAt=new Date().toISOString();
  const task={id:'valid-task',agentId:'admin',title:'Imported task',status:'failed',createdAt,steps:[{agentId:'admin',label:'Work',status:'failed'}]};
  const activity={id:'valid-activity',title:'Activity',detail:'Details',type:'task',createdAt};
  const document={id:'valid-document',name:'reference.md',content:'Reference',updatedAt:createdAt};
  const backup={schemaVersion:1,tasks:[task],messages:[],activity:[activity],documents:[document]};
  const malformed=[
   {...backup,tasks:[{...task,error:{text:'crash'}}]},
   {...backup,tasks:[{...task,steps:[{...task.steps[0],label:{text:'crash'}}]}]},
   {...backup,tasks:[{...task,updatedAt:'invalid'}]},
   {...backup,tasks:[task,{...task}]},
   {...backup,activity:[{...activity,title:{text:'crash'}}]},
   {...backup,activity:[{...activity,detail:{text:'crash'}}]},
   {...backup,activity:[{...activity,type:{text:'crash'}}]},
   {...backup,documents:[{...document,updatedAt:'invalid'}]},
   {...backup,documents:[document,{...document}]},
  ];
  for(const invalid of malformed)assert.equal((await request(port,'backup/restore',{approved:true,backup:invalid})).status,400);
  assert.equal((await request(port,'state',undefined,'GET')).body.tasks.length,0,'rejected imports leave current workspace intact');
  assert.equal((await request(port,'backup/restore',{approved:true,backup})).status,200);
  const restored=(await request(port,'state',undefined,'GET')).body;assert.equal(restored.tasks[0].id,task.id);assert.equal(restored.documentCount,1);
 }finally{if(backend?.exitCode===null)await stop(backend);await fs.rm(dataDir,{recursive:true,force:true});}
});

test('scheduled tasks remain queued before their deadline and execute once after restart',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-schedule-'));const calls=[];
 const mock=http.createServer(async(req,res)=>{for await(const chunk of req){}calls.push(Date.now());res.setHeader('content-type','application/json');res.end(JSON.stringify({message:{content:'jadwal selesai'}}));});
 const mockPort=await listen(mock);const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 try{
  backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1'});assert.equal((await request(port,'settings',{baseUrl:`http://127.0.0.1:${mockPort}`,model:'offline-model'},'PUT')).status,200);
  assert.equal((await request(port,'tasks',{title:'Jadwal invalid',scheduledAt:'not-a-date'})).status,400);
  assert.equal((await request(port,'tasks',{title:'Jadwal terlalu jauh',scheduledAt:new Date(Date.now()+367*86400e3).toISOString()})).status,400);
  const due=Date.now()+15000;const created=await request(port,'tasks',{title:'Tugas terjadwal',agentId:'admin',scheduledAt:new Date(due).toISOString()});assert.equal(created.status,202);assert.equal(created.body.task.status,'queued');
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(calls.length,0);
  await stop(backend);backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1'});
  const before=(await request(port,'state',undefined,'GET')).body.tasks.find(t=>t.id===created.body.task.id);assert.equal(before.scheduledAt,new Date(due).toISOString());assert.equal(before.status,'queued');assert.equal(calls.length,0);
  await waitFor(async()=>{const current=(await request(port,'state',undefined,'GET')).body.tasks.find(t=>t.id===created.body.task.id);return current?.status==='completed';},30000);
  assert.equal(calls.length,1);assert.ok(calls[0]>=due,'provider must not be invoked before schedule');
  await waitFor(async()=>{const persisted=JSON.parse(await fs.readFile(path.join(dataDir,'state.json'),'utf8'));return persisted.tasks.find(t=>t.id===created.body.task.id)?.status==='completed';});
  await stop(backend);backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1'});assert.equal((await request(port,'state',undefined,'GET')).body.tasks.find(t=>t.id===created.body.task.id).status,'completed');assert.equal(calls.length,1);
  const future=await request(port,'tasks',{title:'Ulang sekarang',agentId:'admin',scheduledAt:new Date(Date.now()+60_000).toISOString()});assert.equal(future.status,202);
  assert.equal((await request(port,`tasks/${future.body.task.id}/cancel`,{})).body.task.status,'cancelled');
  const retry=await request(port,`tasks/${future.body.task.id}/retry`,{});assert.equal(retry.status,202);assert.equal(retry.body.task.scheduledAt,undefined);
  await waitFor(async()=>(await request(port,'state',undefined,'GET')).body.tasks.find(t=>t.id===future.body.task.id)?.status==='completed');assert.equal(calls.length,2,'retry runs now, ignoring the previous future schedule');
 }finally{if(backend?.exitCode===null)await stop(backend);mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await fs.rm(dataDir,{recursive:true,force:true});}
});

test('chat request IDs are idempotent, per-agent serialized, and clear is safe',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'harmes-chat-lock-'));let calls=0;let release;
 await fs.writeFile(path.join(dataDir,'state.json'),JSON.stringify({schemaVersion:1,tasks:[],messages:[{id:'interrupted-user',agentId:'admin',role:'user',content:'interrupted',requestId:'interrupted_request_01',createdAt:new Date().toISOString()}],activity:[]}));
 const mock=http.createServer(async(req,res)=>{for await(const chunk of req){}calls++;await new Promise(resolve=>{release=resolve;});res.setHeader('content-type','application/json');res.end(JSON.stringify({message:{content:'idempotent result'}}));});
 const mockPort=await listen(mock);const spare=http.createServer();const port=await listen(spare);await new Promise(resolve=>spare.close(resolve));let backend;
 try{backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1'});assert.equal((await request(port,'state',undefined,'GET')).body.messages.length,0,'interrupted requests are removed at startup');assert.equal((await request(port,'settings',{baseUrl:`http://127.0.0.1:${mockPort}`,model:'offline-model'},'PUT')).status,200);
  const requestId='req_same_message_01';const first=request(port,'chat',{agentId:'admin',message:'sama',requestId});await waitFor(()=>calls===1);
  assert.equal((await request(port,'chat',{agentId:'admin',message:'lain',requestId:'req_other_message_02'})).status,409);
  assert.equal((await request(port,'chat',{agentId:'admin',message:'sama',requestId})).status,409);
  assert.equal((await request(port,'messages?agentId=admin',undefined,'DELETE')).status,409);
  assert.equal((await request(port,'messages',undefined,'DELETE')).status,409);
  release();const firstResult=await first;assert.equal(firstResult.status,200);
  const replay=await request(port,'chat',{agentId:'admin',message:'sama',requestId});assert.equal(replay.status,200);assert.equal(calls,1);assert.equal(replay.body.message.replyTo,(await request(port,'state',undefined,'GET')).body.messages[0].id);assert.equal(replay.body.message.id,firstResult.body.message.id);
  assert.equal((await request(port,'chat',{agentId:'admin',message:'berubah',requestId})).status,409);
  assert.equal((await request(port,'chat',{agentId:'director',message:'sama',requestId})).status,409);
  assert.equal((await request(port,'chat',{agentId:'admin',message:'sama',requestId:'bad'})).status,400);
  const state=(await request(port,'state',undefined,'GET')).body;assert.equal(state.messages.filter(m=>m.role==='user').length,1);assert.equal(state.messages.filter(m=>m.role==='assistant').length,1);
  await stop(backend);backend=await start(port,dataDir,{AI_ALLOW_LOCAL_COMPATIBLE:'1'});const replayAfterRestart=await request(port,'chat',{agentId:'admin',message:'sama',requestId});assert.equal(replayAfterRestart.status,200);assert.equal(replayAfterRestart.body.message.id,firstResult.body.message.id);assert.equal(calls,1);
  assert.equal((await request(port,'messages?agentId=admin',undefined,'DELETE')).status,204);
 }finally{if(release)release();if(backend?.exitCode===null)await stop(backend);mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await fs.rm(dataDir,{recursive:true,force:true});}
});
