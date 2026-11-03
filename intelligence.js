import fs from 'node:fs';
export const INTELLIGENCE_PROTOCOL=['Kamu adalah agen AI operasional yang jujur dan dapat diaudit.','Bedakan fakta dari asumsi. Tandai informasi yang belum tersedia.','Jangan mengaku menjalankan alat, mengirim pesan, menerbitkan konten, atau mengubah berkas jika bukti eksekusi tidak ada.','Lindungi data rahasia dan jangan meminta kredensial di dalam percakapan.'].join('\\n');
const roster=JSON.parse(fs.readFileSync(new URL('./public/team.json',import.meta.url),'utf8')).members;
const SPECIALIST_GUIDANCE={director:'Pimpin keputusan, batasan, risiko, pemilik keputusan, dan langkah berikutnya.',admin:'Kelola ruang lingkup, dependensi, jadwal, pemilik tugas, dan kriteria selesai.',developer:'Rancang implementasi yang dapat diuji. Sertakan asumsi teknis dan verifikasi.',imam:'Lakukan QA faktual: cari cacat konkret, bukti, dampak, dan perbaikan yang diperlukan.',graphic_designer:'Susun komposisi, hierarki visual, aksesibilitas, dan spesifikasi aset yang dapat dibuat.',copywriter:'Tulis draf jelas dengan klaim yang bersumber dari instruksi. Tandai klaim yang perlu verifikasi.',video_editor:'Susun storyboard dan edit decision list. Jangan mengaku menghasilkan video tanpa layanan render.'};
export const professionalInstruction=id=>SPECIALIST_GUIDANCE[id]||'Kerjakan bagian tugas sesuai jabatan secara terstruktur. Berikan keluaran, bukti, risiko, dan langkah lanjut.';
export const MODEL_POLICY=Object.freeze({director:'reasoning',admin:'reasoning',developer:'coding',imam:'reasoning',security_privacy:'reasoning',data_integration:'coding',graphic_designer:'creative',copywriter:'creative',video_editor:'creative',default:'general'});
const list=v=>Array.isArray(v)?v:[String(v||'').trim()].filter(Boolean);
const profiles={};
for(const a of roster) profiles[a.id]=Object.freeze({identity:`Agen AI ${a.name||a.shortName||a.id}; bukan karyawan manusia.`,profession:a.role||a.department||'Agen operasional',skills:list(a.skills||a.expertise||a.role),standards:['Pisahkan fakta, asumsi, dan data yang belum tersedia.','Sertakan bukti serta kriteria penerimaan.'],boundaries:['Jangan mengaku melakukan tindakan tanpa bukti eksekusi.','Jangan meminta atau menampilkan kredensial.'],method:SPECIALIST_GUIDANCE[a.id]||'Kerjakan bagian tugas sesuai jabatan secara terstruktur.',output:'Keluaran terstruktur, ringkas, dapat ditinjau, dan menyebutkan ketidakpastian.',validation:'Jelaskan pemeriksaan yang benar-benar dilakukan dan pemeriksaan yang belum dilakukan.',collaboration:'Gunakan kontribusi agen lain sebagai konteks; tandai konflik dan minta keputusan pemilik.',finish:'Akhiri dengan hasil, risiko tersisa, pemilik langkah berikutnya, dan kriteria selesai.'});
export const ROLE_PROFILES=Object.freeze(profiles);
export function selectModel(id,s={}){const policy=MODEL_POLICY[id]||MODEL_POLICY[s.roleKind]||MODEL_POLICY.default;return (s.models||{})[policy]||s.model||s.defaultModel||null;}
export function verifyModelResponse(response,provenance={}){const reasons=[];if(typeof response!=='string'||!response.trim())reasons.push('empty_response');if(provenance.status&&provenance.status!=='completed')reasons.push('incomplete_inference');if(!provenance.model&&!provenance.reportedModel)reasons.push('model_unrecorded');return {verified:!reasons.length,reasons,status:reasons.length?'unverified':'verified'};}
export function buildAgentSystemPrompt(id,context=''){const p=ROLE_PROFILES[id]||{identity:'Agen AI operasional.',profession:'Agen',skills:[],standards:[],boundaries:[],method:professionalInstruction(id),output:'',validation:'',collaboration:'',finish:''};return [INTELLIGENCE_PROTOCOL,`IDENTITAS: ${p.identity}`,`PROFESI: ${p.profession}`,`KEAHLIAN: ${p.skills.join('; ')}`,`STANDAR: ${p.standards.join('; ')}`,`BATASAN: ${p.boundaries.join('; ')}`,`METODE: ${p.method}`,`KELUARAN: ${p.output}`,`VALIDASI: ${p.validation}`,`KOLABORASI: ${p.collaboration}`,`SELESAI: ${p.finish}`,context].filter(Boolean).join('\\n');}



// Stage 6 brain contract. Declarations only; unavailable tools remain unavailable.
export const TOOL_REGISTRY=Object.freeze({
  model:Object.freeze({id:'model',kind:'inference',implemented:true,sideEffects:false}),
  project_context:Object.freeze({id:'project_context',kind:'context',implemented:true,sideEffects:false}),
  artifact_read:Object.freeze({id:'artifact_read',kind:'storage',implemented:true,sideEffects:false}),
  artifact_write:Object.freeze({id:'artifact_write',kind:'storage',implemented:true,sideEffects:true}),
  shell:Object.freeze({id:'shell',kind:'execution',implemented:false,sideEffects:true}),
  web_fetch:Object.freeze({id:'web_fetch',kind:'network',implemented:false,sideEffects:false}),
  publish:Object.freeze({id:'publish',kind:'external',implemented:false,sideEffects:true}),
  messaging:Object.freeze({id:'messaging',kind:'external',implemented:false,sideEffects:true})
});
const READ_CONTEXT=['model','project_context'];
const ROLE_TOOLS={
  director:READ_CONTEXT,admin:READ_CONTEXT,marketing:READ_CONTEXT,imam:[...READ_CONTEXT,'artifact_read'],
  developer:[...READ_CONTEXT,'artifact_read','artifact_write'],drian:[...READ_CONTEXT,'artifact_read','artifact_write'],vimala:[...READ_CONTEXT,'artifact_read','artifact_write'],waliyudin:[...READ_CONTEXT,'artifact_read','artifact_write'],ksanti:[...READ_CONTEXT,'artifact_read','artifact_write'],
  data_integration:[...READ_CONTEXT,'artifact_read','artifact_write'],implementation:[...READ_CONTEXT,'artifact_read','artifact_write'],security_privacy:[...READ_CONTEXT,'artifact_read'],
  graphic_designer:[...READ_CONTEXT,'artifact_write'],copywriter:READ_CONTEXT,video_editor:READ_CONTEXT,
  default:READ_CONTEXT
};
export const ROLE_TOOL_PERMISSIONS=Object.freeze(Object.fromEntries(Object.entries(ROLE_TOOLS).map(([id,tools])=>[id,Object.freeze([...new Set(tools)])])));
export const CONTEXT_LEVELS=Object.freeze({level1:'agent',level2:'project',level3:'organization'});
const cleanId=v=>typeof v==='string'&&v.trim()?v.trim():null;
export function allowedToolsForRole(id,requested){const base=ROLE_TOOL_PERMISSIONS[id]||ROLE_TOOL_PERMISSIONS.default;const list=Array.isArray(requested)?requested:base;return Object.freeze([...new Set(list.filter(tool=>base.includes(tool)&&TOOL_REGISTRY[tool]))]);}
export function agentMemoryNamespace(id,{projectId,organizationId='workspace'}={}){const agent=cleanId(id)||'unknown';return {level1:`agent:${agent}`,level2:cleanId(projectId)?`project:${cleanId(projectId)}`:null,level3:`organization:${cleanId(organizationId)||'workspace'}`};}
export function buildAgentMetadata(id,options={}){const policy=MODEL_POLICY[id]||MODEL_POLICY[options.roleKind]||MODEL_POLICY.default;const provider=cleanId(options.provider||options.modelProvider);const model=cleanId(options.model||options.modelId)||cleanId(options.models?.[policy]);const status=options.executionStatus||options.status||((provider&&model&&options.verified===true)?'ready':provider&&model?'unverified':'not_ready');const budget=options.budget&&typeof options.budget==='object'?{tokenBudget:Number.isFinite(options.budget.tokenBudget)?Math.max(0,options.budget.tokenBudget):null,durationBudgetMs:Number.isFinite(options.budget.durationBudgetMs)?Math.max(0,options.budget.durationBudgetMs):null}:{tokenBudget:null,durationBudgetMs:null};const capabilities=Array.isArray(options.capabilities)?options.capabilities:(ROLE_PROFILES[id]?.skills||[]);return Object.freeze({agentId:id,model:{provider:provider||null,id:model||null,policy},reasoning:{mode:options.reasoning?.mode||policy,effort:options.reasoning?.effort||null,maxTokens:Number.isFinite(options.reasoning?.maxTokens)?options.reasoning.maxTokens:null},capabilities:Object.freeze([...new Set(capabilities.filter(Boolean))]),allowedTools:allowedToolsForRole(id,options.allowedTools),memoryNamespace:agentMemoryNamespace(id,options),budget:Object.freeze(budget),executionStatus:status});}
export const createAgentBrain=buildAgentMetadata;
export const getAgentBrain=buildAgentMetadata;
export const createAgentRegistry=(options={})=>Object.freeze(Object.fromEntries(roster.map(agent=>[agent.id,buildAgentMetadata(agent.id,options[agent.id]||options)])));
