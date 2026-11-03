import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installWorkspaceRoutes } from '../workspace-routes.js';

async function setup(t, settings={integrations:{tg:{type:'telegram',name:'TG',token:'tok',enabled:true},gh:{type:'github',name:'GH',enabled:true}}}, failSend=false, failActivity=false) {
  const state={documents:[]}; let saves=0, sends=0; const activities=[];
  const app=express(); app.use(express.json({limit:'1mb'})); app.use((req,res,next)=>{req.sessionId=req.headers['x-session']||'s1'; next();});
  installWorkspaceRoutes(app,{getState:()=>state,getSettings:()=>settings,save:async()=>{saves++},activity:async(...x)=>{if(failActivity)throw new Error('audit failed');activities.push(x)},inspect:async()=>({source:'x',title:'T',content:'safe',items:[]}),fetchJson:async()=>{sends++; if(failSend)throw new Error('tok secret leak'); return {ok:true,result:{message_id:7}}},telegramBase:'https://api.telegram.org'});
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0); t.after(()=>server.close()); const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,opts={})=>{const r=await fetch(base+path,{headers:{'content-type':'application/json'},...opts}); let body; try{body=await r.json()}catch{} return {r,body};};
  return {state,settings,call,stats:()=>({saves,sends,activities})};
}
test('documents metadata, caps, deletion',async t=>{const x=await setup(t); let q=await x.call('/api/documents'); assert.deepEqual(q.body,{documents:[]}); q=await x.call('/api/documents',{method:'POST',body:JSON.stringify({name:'a.md',content:'secret'})}); assert.equal(q.r.status,201); assert.equal(q.body.document.content,undefined); q=await x.call('/api/documents'); assert.equal(q.body.documents[0].content,undefined); assert.equal((await x.call('/api/documents/'+x.state.documents[0].id,{method:'DELETE'})).r.status,204);});
test('inspect read-only and telegram approval owner/fingerprint/concurrency',async t=>{const x=await setup(t); let q=await x.call('/api/integrations/gh/inspect',{method:'POST',body:'{}'}); assert.equal(q.r.status,200); q=await x.call('/api/integrations/tg/actions',{method:'POST',body:JSON.stringify({chatId:'123',text:'Hi'})}); assert.equal(q.r.status,201); const id=q.body.action.id; const a=await Promise.all([x.call('/api/actions/'+id+'/approve',{method:'POST',body:'{"approved":true}'}),x.call('/api/actions/'+id+'/approve',{method:'POST',body:'{"approved":true}'})]); assert.equal(a.filter(v=>v.r.status===200).length,1); assert.equal(x.stats().sends,1);});
test('approval requires explicit true, changed connector blocks, failure consumed',async t=>{const x=await setup(t); let q=await x.call('/api/integrations/tg/actions',{method:'POST',body:'{"chatId":"123","text":"Hi"}'}); const id=q.body.action.id; assert.equal((await x.call('/api/actions/'+id+'/approve',{method:'POST',body:'{}'})).r.status,400); x.settings.integrations.tg.token='changed'; assert.equal((await x.call('/api/actions/'+id+'/approve',{method:'POST',body:'{"approved":true}'})).r.status,409);});
test('document caps enforce 20 documents and 100000 characters',async t=>{
  const x=await setup(t); const post=doc=>x.call('/api/documents',{method:'POST',body:JSON.stringify(doc)});
  assert.equal((await post({name:'big.txt',content:'x'.repeat(100001)})).r.status,400);
  for(let i=0;i<20;i++)assert.equal((await post({name:`${i}.txt`,content:'a'})).r.status,201);
  assert.equal((await post({name:'overflow.txt',content:'a'})).r.status,409); assert.equal(x.state.documents.length,20);
});
test('preview sends nothing, owner mismatch rejected, failed approval consumed without exposing token',async t=>{
  const x=await setup(t,undefined,true);
  const q=await x.call('/api/integrations/tg/actions',{method:'POST',body:'{"chatId":"123","text":"Hi"}'}); const id=q.body.action.id;
  assert.equal(x.stats().sends,0);
  assert.equal((await x.call('/api/actions/'+id+'/approve',{method:'POST',headers:{'content-type':'application/json','x-session':'other'},body:'{"approved":true}'})).r.status,404);
  const failure=await x.call('/api/actions/'+id+'/approve',{method:'POST',body:'{"approved":true}'});
  assert.equal(failure.r.status,502); assert.equal(JSON.stringify(failure.body).includes('tok'),false);
  assert.equal((await x.call('/api/actions/'+id+'/approve',{method:'POST',body:'{"approved":true}'})).r.status,409); assert.equal(x.stats().sends,1);
});

test('audit write failure preserves acknowledged Telegram delivery and consumed action',async t=>{
  for(const failSend of [false,true]){
    const x=await setup(t,undefined,failSend,true);
    const preview=await x.call('/api/integrations/tg/actions',{method:'POST',body:'{"chatId":"123","text":"Hi"}'});
    const path='/api/actions/'+preview.body.action.id+'/approve';
    const result=await x.call(path,{method:'POST',body:'{"approved":true}'});
    assert.equal(result.r.status,failSend?502:200);
    if(!failSend){assert.equal(result.body.action.status,'completed');assert.equal(result.body.messageId,7);}
    else assert.match(result.body.error,/Periksa Telegram/);
    assert.equal((await x.call(path,{method:'POST',body:'{"approved":true}'})).r.status,409);
    assert.equal(x.stats().sends,1);
  }
});

test('stage8 knowledge metadata, client isolation, and learning endpoints',async t=>{
  const x=await setup(t);
  const post=(body,client)=>x.call('/api/documents',{method:'POST',headers:{'x-client-id':client,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({name:'brand.md',content:'SoftKlinik guideline',type:'sop',source:{label:'brand-v1.md'},tags:['brand']},'client-a')).r.status,201);
  assert.equal((await x.call('/api/knowledge',{headers:{'x-client-id':'client-b'}})).body.documents.length,0);
  const visible=await x.call('/api/knowledge',{headers:{'x-client-id':'client-a'}}); assert.equal(visible.body.documents.length,1); assert.equal(visible.body.documents[0].version,1);
  const search=await x.call('/api/knowledge/search?q=guideline',{headers:{'x-client-id':'client-a'}}); assert.match(search.body.knowledge,/brand-v1/);
  const learned=await x.call('/api/knowledge/errors',{method:'POST',headers:{'x-client-id':'client-a','content-type':'application/json'},body:JSON.stringify({content:'Build gagal karena kontrak API',projectId:'p1',source:{label:'incident'}})});
  assert.equal(learned.r.status,201); assert.equal(learned.body.entry.type,'error');
});
