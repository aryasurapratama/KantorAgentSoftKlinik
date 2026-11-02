import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOfficeState } from './office-state.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PORT = Number(process.env.PORT || 4318);
const { members, departments } = JSON.parse(await fs.readFile(path.join(ROOT, 'public', 'team.json'), 'utf8'));
const AGENTS = members.map(({prompt, ...agent}) => agent);
const DEPARTMENT_TEAMS = {
  leadership:['director','admin','product_manager'],
  engineering:['marketing','developer','vimala','ksanti','imam'],
  creative:['content_strategist','copywriter','graphic_designer','wibisono','video_editor'],
  marketing:['marketing_lead','seo_specialist','ads_specialist','marketing_analyst'],
  sales:['sales_development','account_executive','partnership'],
  customer:['eka','implementation','product_trainer','customer_success'],
  operations:['hr_operations','finance','legal'],
  security:['security_privacy','data_integration','clinical_workflow'],
};
const ROLES = Object.fromEntries(members.map(agent => [agent.id, agent.prompt]));
const AI_NUM_THREADS = Math.max(1, Math.min(8, Number.parseInt(process.env.AI_NUM_THREADS || '4', 10) || 4));
let settings = {provider:'ollama',baseUrl:'http://127.0.0.1:11434',model:'qwen2.5:3b',businessName:'Softklinik Harmes',context:'Bantu tim bekerja cepat, rapi, dan aman.'};
let state = {departments,agents:AGENTS,tasks:[],messages:[],activity:[]};
let diskQueue=Promise.resolve();
let inferenceQueue=Promise.resolve();
let taskWorker=false;
const activeInference = new Set();
const oauthStates = new Map();
const TELEGRAM_API_BASE = (process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, '');
const uuid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function writeJson(file,value){const content=JSON.stringify(value,null,2); const work=diskQueue.catch(()=>{}).then(async()=>{await fs.mkdir(DATA_DIR,{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,content);await fs.rename(tmp,file);});diskQueue=work;return work;}
const save=()=>writeJson(STATE_FILE,state);
function safeSettings(){const {apiKey,integrations,...safe}=settings;return {...safe,hasApiKey:Boolean(apiKey||process.env.AI_API_KEY),integrationCount:Object.keys(integrations||{}).length};}
const CONNECTOR_TYPES=new Set(['github','social','web','telegram']);
function safeConnectors(){return Object.entries(settings.integrations||{}).map(([id,item])=>({id,type:item.type,name:item.name,baseUrl:item.baseUrl,account:item.account,scopes:item.scopes||[],connected:Boolean(item.token||item.clientSecret),enabled:item.enabled!==false,approvalRequired:item.approvalRequired!==false,updatedAt:item.updatedAt}));}
function validConnector(body){return body&&typeof body==='object'&&CONNECTOR_TYPES.has(body.type)&&typeof body.name==='string'&&body.name.trim().length>0&&body.name.length<=120&&(!body.baseUrl||validUrl(body.baseUrl))&&(!body.scopes||Array.isArray(body.scopes)&&body.scopes.every(s=>typeof s==='string'&&s.length<80));}
function validUrl(raw){try{const u=new URL(raw);return !u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)));}catch{return false;}}
function localOrigin(origin){try{const u=new URL(origin);return ['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}}
function errorMessage(error){if(error.name==='AbortError')return 'Model terlalu lama merespons. Coba tugas yang lebih pendek.';if(error.message==='fetch failed')return 'Tidak bisa menghubungi AI. Pastikan Ollama berjalan dan model sudah diunduh.';return error.message;}
async function fetchJson(url,opts={},timeout=300000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{...opts,signal:controller.signal,redirect:'error',headers:{'content-type':'application/json',...(opts.headers||{})}});const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw new Error(`Provider mengembalikan respons tidak valid (HTTP ${response.status}).`);}if(!response.ok){const detail=typeof data.error==='string'?data.error:data.error?.message||data.description;throw new Error(detail||`Provider mengembalikan HTTP ${response.status}.`);}return data;}finally{clearTimeout(timer);}}
function ask(agentId,messages,extra='',maxTokens=768){
  // Serialize all inference, including chat, for CPU-only laptops.
  const selected={...settings};
  const job=inferenceQueue.catch(()=>{}).then(async()=>{
    activeInference.add(agentId);
    try {
    const system=[ROLES[agentId],`Bisnis: ${selected.businessName}.`,selected.context,'Jawab dalam Bahasa Indonesia. Kamu hanya menghasilkan saran dan draf. Jangan mengaku mengirim pesan, mengubah sistem, atau menjalankan kode. Jangan mengarang data bisnis atau pasien.',extra].filter(Boolean).join('\n');
    const bodyMessages=[{role:'system',content:system},...messages.slice(-12)];
    const base=selected.baseUrl.replace(/\/$/,'');
    const key=selected.apiKey||process.env.AI_API_KEY;
    const body=selected.provider==='ollama'
      ? await fetchJson(`${base}/api/chat`,{method:'POST',body:JSON.stringify({model:selected.model,messages:bodyMessages,stream:false,options:{num_predict:maxTokens,num_ctx:4096,num_thread:AI_NUM_THREADS}})})
      : await fetchJson(`${base}/chat/completions`,{method:'POST',headers:key?{authorization:`Bearer ${key}`}:{},body:JSON.stringify({model:selected.model,messages:bodyMessages})});
    const content=selected.provider==='ollama'?body.message?.content:body.choices?.[0]?.message?.content;
    if(typeof content!=='string'||!content.trim())throw new Error('Model tidak mengembalikan jawaban.');
    return content;
    } finally { activeInference.delete(agentId); }
  });
  inferenceQueue=job;return job;
}
async function activity(title,detail,type='task'){state.activity.unshift({id:uuid(),type,title,detail,createdAt:now()});state.activity=state.activity.slice(0,100);await save();}
async function runTask(task){
  task.status='running';task.updatedAt=now();
  const departmentId=task.agentId.startsWith('department:')?task.agentId.slice(11):null;
  const departmentMembers=departmentId?AGENTS.filter(a=>a.departmentId===departmentId):[];
  const members=task.agentId==='team'?['director','admin','marketing','developer','director']:departmentId?(DEPARTMENT_TEAMS[departmentId]||departmentMembers.map(a=>a.id)).slice(0,5):[task.agentId];
  task.steps=members.map((agentId,index)=>({agentId,label:task.agentId==='team'&&index===0?'Arya menyusun rencana':task.agentId==='team'&&index===4?'Arya merangkum hasil':`${AGENTS.find(a=>a.id===agentId).shortName} mengerjakan tugas`,status:'queued'}));
  await save();
  const original=`Tugas: ${task.title}\n${task.description}`;
  const notes=[];
  try{
    for(let index=0;index<task.steps.length;index++){
      const step=task.steps[index];step.status='running';step.startedAt=now();task.updatedAt=step.startedAt;await save();
      const instruction=departmentId?(index===task.steps.length-1?'Gabungkan kontribusi departemen menjadi hasil akhir dengan langkah berikutnya, penanggung jawab, dan pertanyaan yang belum terjawab.':'Berikan kontribusi sesuai keahlianmu untuk tugas departemen ini. Jangan mengulang kontribusi sebelumnya.'):task.agentId==='team'?(index===0?'Susun rencana singkat dan pembagian tugas untuk Sigit (Project Manager), Fajri (System Analyst), dan Dhensa (Full Stack Developer).':index===4?'Gabungkan hasil tim menjadi jawaban akhir dengan prioritas, penanggung jawab, dan langkah berikutnya.':'Berikan kontribusi sesuai peranmu. Jangan mengulang seluruh rencana.'):'';
      step.content=await ask(step.agentId,[{role:'user',content:[original,...notes,instruction].join('\n\n')}],instruction,(task.agentId==='team'||departmentId)?(index===task.steps.length-1?768:256):768);
      step.status='completed';step.endedAt=now();task.updatedAt=step.endedAt;notes.push(`${step.label}:\n${step.content}`);await save();
    }
    task.result=task.steps.at(-1).content;task.status='completed';task.updatedAt=now();await activity('Tugas selesai',task.title);
  }catch(error){task.status='failed';task.error=errorMessage(error);task.updatedAt=now();for(const step of task.steps)if(step.status==='running'){step.status='failed';step.endedAt=task.updatedAt;}await activity('Tugas gagal',task.error,'error');}
  await save();
}
async function pumpTasks(){if(taskWorker)return;taskWorker=true;try{let next;while((next=[...state.tasks].reverse().find(t=>t.status==='queued')))await runTask(next);}finally{taskWorker=false;}}
const app=express();
app.use('/api',(req,res,next)=>{
  const origin=req.headers.origin;
  if(origin&&!localOrigin(origin))return res.status(403).json({error:'Permintaan dari origin ini ditolak.'});
  if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Headers','Content-Type');res.set('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');}
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
});
app.use(express.json({limit:'64kb'}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'Kantor AI Softklinik Harmes',provider:settings.provider,model:settings.model}));
app.get('/api/state',(req,res)=>res.json({...state,settings:safeSettings()}));
app.get('/api/office-state',(req,res)=>res.json(buildOfficeState(state,settings,[...activeInference])));
app.get('/api/settings',(req,res)=>res.json(safeSettings()));
app.get('/api/integrations',(req,res)=>{const connectors=safeConnectors();res.json({connectors,providers:[{id:'github',name:'GitHub',detail:'Repositori, issue, pull request',kind:'code',oauth:Boolean(process.env.GITHUB_CLIENT_ID)},{id:'social',name:'Media sosial',detail:'Kalender konten dan statistik',kind:'social',oauth:false},{id:'web',name:'Website / CMS',detail:'WordPress, hosting, analytics',kind:'web',oauth:false},{id:'telegram',name:'Telegram',detail:'Bot pesan dan notifikasi',kind:'messaging',oauth:false}],connections:connectors.map(c=>({provider:c.type,id:c.id,name:c.name,account:c.account,connected:c.connected,approvalRequired:c.approvalRequired}))});});
app.post('/api/integrations/:provider/connect',async(req,res)=>{
  const provider=req.params.provider;
  if(!CONNECTOR_TYPES.has(provider))return res.status(404).json({error:'Provider tidak didukung.'});
  if(provider==='telegram'){
    const token=typeof req.body?.token==='string'?req.body.token.trim():'';
    if(!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token))return res.status(400).json({error:'Token bot Telegram tidak valid. Salin token dari @BotFather.'});
    try{
      const result=await fetchJson(`${TELEGRAM_API_BASE}/bot${encodeURIComponent(token)}/getMe`,{},15000);
      if(result.ok!==true||!result.result?.id) return res.status(502).json({error:result.description||'Telegram menolak token bot.'});
      const bot=result.result;
      const id=typeof req.body?.id==='string'&&/^[a-z0-9_-]{3,80}$/i.test(req.body.id)?req.body.id:`telegram-${bot.id}`;
      settings.integrations ||= {};
      const previous=settings.integrations[id]||{};
      const account=bot.username?`@${bot.username}`:(bot.first_name||String(bot.id));
      const item={...previous,id,type:'telegram',name:typeof req.body?.name==='string'&&req.body.name.trim()?req.body.name.trim():`Telegram · ${account}`,baseUrl:TELEGRAM_API_BASE,scopes:['getMe'],account,enabled:true,approvalRequired:true,updatedAt:now(),token};
      if(typeof req.body?.chatId==='string'&&req.body.chatId.trim())item.chatId=req.body.chatId.trim();
      await writeJson(SETTINGS_FILE,{...settings,integrations:{...settings.integrations,[id]:item}});settings={...settings,integrations:{...settings.integrations,[id]:item}};
      return res.status(previous.id?200:201).json({ok:true,provider,requiresApproval:true,bot:{id:bot.id,username:bot.username,firstName:bot.first_name},connector:safeConnectors().find(c=>c.id===id)});
    }catch(error){return res.status(502).json({error:`Tidak bisa menghubungi Telegram: ${errorMessage(error)}`});}
  }
  if(provider==='github'&&(!process.env.GITHUB_CLIENT_ID||!process.env.GITHUB_CLIENT_SECRET))return res.status(503).json({error:'GitHub OAuth belum siap. Set GITHUB_CLIENT_ID dan GITHUB_CLIENT_SECRET di server.'});
  const body={...(req.body||{}),type:provider,name:req.body?.name||provider,baseUrl:req.body?.baseUrl||''};if(typeof body.token==='string'&&body.token.trim())body.approvalRequired=true;return res.status(202).json({ok:true,provider,requiresApproval:true,message:provider==='github'?'Mulai OAuth GitHub melalui endpoint authorize.':'Konektor disimpan sebagai konfigurasi; publikasi tetap memerlukan persetujuan.'});
});
app.get('/api/integrations/github/authorize',(req,res)=>{const clientId=process.env.GITHUB_CLIENT_ID;if(!clientId)return res.status(503).json({error:'GITHUB_CLIENT_ID belum dikonfigurasi di server.'});const redirectUri=typeof req.query.redirectUri==='string'&&req.query.redirectUri.startsWith('http://127.0.0.1:')?req.query.redirectUri:'';if(!redirectUri)return res.status(400).json({error:'redirectUri lokal diperlukan.'});const state=crypto.randomUUID();oauthStates.set(state,{createdAt:Date.now(),redirectUri});for(const [key,value] of oauthStates)if(Date.now()-value.createdAt>10*60e3)oauthStates.delete(key);const scopes='repo,read:user,workflow';const url=new URL('https://github.com/login/oauth/authorize');url.searchParams.set('client_id',clientId);url.searchParams.set('redirect_uri',redirectUri);url.searchParams.set('scope',scopes);url.searchParams.set('state',state);res.json({url:url.toString(),state,scopes:scopes.split(',')});});
app.post('/api/integrations',async(req,res)=>{
  const body=req.body||{};if(!validConnector(body))return res.status(400).json({error:'Konfigurasi konektor tidak valid.'});
  const id=typeof body.id==='string'&&/^[a-z0-9_-]{3,80}$/i.test(body.id)?body.id:crypto.randomUUID();settings.integrations ||= {};
  const previous=settings.integrations[id]||{};const item={...previous,id,type:body.type,name:body.name.trim(),baseUrl:(body.baseUrl||'').trim(),scopes:body.scopes||[],enabled:body.enabled!==false,approvalRequired:true,updatedAt:now()};
  if(typeof body.token==='string'&&body.token.trim())item.token=body.token.trim();if(typeof body.clientSecret==='string'&&body.clientSecret.trim())item.clientSecret=body.clientSecret.trim();
  await writeJson(SETTINGS_FILE,{...settings,integrations:{...settings.integrations,[id]:item}});settings={...settings,integrations:{...settings.integrations,[id]:item}};res.status(previous.id?200:201).json({connector:safeConnectors().find(c=>c.id===id)});
});
app.delete('/api/integrations/:id',async(req,res)=>{const id=req.params.id;settings.integrations ||= {};if(!settings.integrations[id])return res.status(404).json({error:'Konektor tidak ditemukan.'});const integrations={...settings.integrations};delete integrations[id];await writeJson(SETTINGS_FILE,{...settings,integrations});settings={...settings,integrations};res.status(204).end();});
app.post('/api/integrations/:id/approval',async(req,res)=>{const item=settings.integrations?.[req.params.id];if(!item)return res.status(404).json({error:'Konektor tidak ditemukan.'});if(req.body?.approved!==true)return res.status(400).json({error:'Persetujuan eksplisit diperlukan.'});item.lastApprovedAt=now();await writeJson(SETTINGS_FILE,settings);res.json({ok:true,approvedAt:item.lastApprovedAt});});
app.put('/api/settings',async(req,res)=>{
  const body=req.body||{};const next={...settings};
  for(const key of ['provider','baseUrl','model','businessName','context']){
    if(body[key]!==undefined){if(typeof body[key]!=='string'||body[key].length>(key==='context'?8000:500))return res.status(400).json({error:`Nilai ${key} tidak valid.`});next[key]=body[key].trim();}
  }
  if(!['ollama','openai-compatible'].includes(next.provider)||!validUrl(next.baseUrl)||!next.model||!next.businessName)return res.status(400).json({error:'Provider, URL, model, atau nama bisnis tidak valid. URL harus HTTPS atau alamat lokal.'});
  if(body.apiKey!==undefined){if(typeof body.apiKey!=='string'||body.apiKey.length>2000)return res.status(400).json({error:'API key tidak valid.'});if(body.apiKey.trim())next.apiKey=body.apiKey.trim();}
  if(body.clearApiKey===true)delete next.apiKey;
  await writeJson(SETTINGS_FILE,next);settings=next;res.json(safeSettings());
});
app.post('/api/connection/test',async(req,res)=>{try{const selected={...settings};const base=selected.baseUrl.replace(/\/$/,'');const key=selected.apiKey||process.env.AI_API_KEY;const data=await fetchJson(selected.provider==='ollama'?`${base}/api/tags`:`${base}/models`,{headers:key?{authorization:`Bearer ${key}`}:{}} ,15000);const models=selected.provider==='ollama'?(data.models||[]).map(m=>m.name):(data.data||[]).map(m=>m.id);const available=models.includes(selected.model);res.json({ok:available,message:available?'Koneksi berhasil. Model siap dipakai.':`Layanan tersambung, tetapi model ${selected.model} belum tersedia. Unduh model atau pilih model yang tersedia.`,models});}catch(error){res.status(503).json({ok:false,message:errorMessage(error),models:[]});}});
app.post('/api/chat',async(req,res)=>{
  const {agentId,message}=req.body||{};
  if(typeof agentId!=='string'||!Object.hasOwn(ROLES,agentId)||typeof message!=='string'||!message.trim()||message.length>8000)return res.status(400).json({error:'Agen atau pesan tidak valid.'});
  const user={id:uuid(),agentId,role:'user',content:message.trim(),createdAt:now()};state.messages.push(user);await save();
  const history=state.messages.filter(m=>m.agentId===agentId).slice(-12).map(({role,content})=>({role,content}));
  try{const content=await ask(agentId,history);const reply={id:uuid(),agentId,role:'assistant',content,createdAt:now()};state.messages.push(reply);await save();await activity('Percakapan baru',AGENTS.find(a=>a.id===agentId).name,'chat');res.json({message:reply});}catch(error){res.status(503).json({error:errorMessage(error)});}
});
app.post('/api/tasks',async(req,res)=>{
  const {title,description='',agentId='team'}=req.body||{};
  if(typeof title!=='string'||!title.trim()||title.length>200||typeof description!=='string'||description.length>12000||!['team',...AGENTS.map(a=>a.id),...departments.map(d=>`department:${d.id}`)].includes(agentId))return res.status(400).json({error:'Data tugas tidak valid.'});
  const task={id:uuid(),title:title.trim(),description:description.trim(),agentId,status:'queued',createdAt:now(),updatedAt:now(),steps:[]};state.tasks.unshift(task);await save();await activity('Tugas baru',task.title);res.status(202).json({task});pumpTasks();
});
app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint tidak ditemukan.'}));
try{await fs.access(path.join(ROOT,'dist','index.html'));app.use(express.static(path.join(ROOT,'dist')));app.get('/{*splat}',(req,res)=>res.sendFile(path.join(ROOT,'dist','index.html')));}catch{}
app.use((error,req,res,next)=>{console.error(error.message);res.status(error.type==='entity.parse.failed'?400:500).json({error:error.type==='entity.parse.failed'?'JSON tidak valid.':'Terjadi kesalahan server.'});});
const stored=await readJson(SETTINGS_FILE,{});settings={...settings,...stored};
state=await readJson(STATE_FILE,state);state.agents=AGENTS;state.departments=departments;state.tasks ||= [];state.messages ||= [];state.activity ||= [];
for(const task of state.tasks)if(task.status==='running'){task.status='failed';task.error='Server dimulai ulang sebelum tugas selesai.';task.updatedAt=now();for(const step of task.steps||[])if(step.status==='running')step.status='failed';}
await save();
app.listen(PORT,'127.0.0.1',()=>{console.log(`Kantor AI Softklinik Harmes: http://127.0.0.1:${PORT}`);pumpTasks();});
