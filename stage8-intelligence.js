import { randomUUID } from 'node:crypto';

export const REASONING_PHASES = ['UNDERSTAND','ANALYZE','RETRIEVE','PLAN','EXECUTE','VERIFY','IMPROVE','DELIVER'];
export const PROFESSIONAL_SOPS = Object.freeze({
  developer:['Baca requirement','Periksa arsitektur dan repository','Rencanakan perubahan','Implementasikan','Jalankan test','Periksa keamanan','Serahkan bukti ke QA'],
  graphic_designer:['Baca brief','Gunakan brand guideline resmi','Buat konsep visual','Periksa keterbacaan dan format','Simpan preview','Proses revisi'],
  video_editor:['Analisis tujuan','Tulis naskah dan storyboard','Periksa aset dan izin','Render hanya bila adapter tersedia','Uji file final','Laporkan keterbatasan'],
  marketing:['Pahami audiens dan tujuan','Gunakan knowledge kampanye terbaru','Susun konten','Periksa klaim','Minta persetujuan publikasi','Catat hasil aktual'],
  admin:['Pahami permintaan dan deadline','Periksa dependensi dan kapasitas','Susun rencana operasional','Catat keputusan','Pantau status','Laporkan bukti'],
  quality:['Baca kriteria penerimaan','Periksa hasil secara independen','Jalankan test yang tersedia','Catat cacat dan bukti','Verifikasi perbaikan','Laporkan status gate'],
  director:['Pahami instruksi pemilik','Identifikasi tujuan dan risiko','Pilih karyawan','Delegasikan tugas','Pantau bukti','Tinjau kualitas','Laporkan hasil']
});
export const DEFAULT_BENCHMARKS = Object.freeze([
  { id:'engineering-requirement', department:'engineering', role:'developer', acceptanceCriteria:['Requirement traceability','Code or plan evidence','Test evidence'] },
  { id:'creative-brand', department:'creative', role:'graphic_designer', acceptanceCriteria:['Brand source cited','Readable composition','Correct output format'] },
  { id:'marketing-campaign', department:'marketing', role:'marketing', acceptanceCriteria:['Audience fit','Claim review','Approval status recorded'] },
  { id:'operations-plan', department:'operations', role:'admin', acceptanceCriteria:['Dependencies identified','Owner and deadline recorded','Audit evidence'] },
  { id:'quality-review', department:'quality', role:'imam', acceptanceCriteria:['Independent checks','Defect evidence','Regression result'] }
]);

const stamp = () => new Date().toISOString();
const boundedText = (value, limit=4000) => value == null ? null : String(value).slice(0, limit);

export function createReasoningRun({ taskId=null, agentId=null, projectId=null, complexity='standard' }={}) {
  return { id: randomUUID(), taskId, agentId, projectId, complexity: ['simple','standard','complex'].includes(complexity) ? complexity : 'standard', status:'IN_PROGRESS', phases: REASONING_PHASES.map(name=>({ name, status:'PENDING', startedAt:null, endedAt:null, evidence:null })), createdAt:stamp(), updatedAt:stamp() };
}
export function advanceReasoning(run, phase, { status='COMPLETED', evidence=null }={}) {
  if (!run || !REASONING_PHASES.includes(phase)) throw new Error('Invalid reasoning phase');
  const row=run.phases.find(p=>p.name===phase); if (!row) throw new Error('Phase unavailable');
  if (!['PENDING','IN_PROGRESS','COMPLETED','FAILED','SKIPPED'].includes(status)) throw new Error('Invalid reasoning status');
  const index=REASONING_PHASES.indexOf(phase);
  const previous=run.phases.slice(0,index).find(p=>p.status==='PENDING');
  if (previous && status !== 'SKIPPED') throw new Error(`Reasoning phase out of order: ${previous.name}`);
  const now=stamp(); row.startedAt ||= now; row.status=status; row.endedAt=['COMPLETED','FAILED','SKIPPED'].includes(status)?now:null; row.evidence=boundedText(evidence); run.updatedAt=now;
  if (status==='FAILED') run.status='FAILED';
  else if (run.phases.every(p=>['COMPLETED','SKIPPED'].includes(p.status))) { run.status='COMPLETED'; run.completedAt=now; }
  return run;
}

export function recordExperience({ agentId, projectId, taskId=null, outcome, lesson, tags=[] }={}) {
  if (!agentId || !projectId || !lesson) throw new Error('agentId, projectId and lesson required');
  return { id:randomUUID(), agentId, projectId, taskId, outcome: outcome||'unknown', lesson:String(lesson).slice(0,2000), tags:Array.isArray(tags)?[...new Set(tags.map(String))].slice(0,20):[], createdAt:stamp() };
}
export function recordError({ agentId, projectId, taskId=null, category='unknown', message, severity='medium', resolution=null }={}) {
  if (!agentId || !projectId || !message) throw new Error('agentId, projectId and message required');
  return { id:randomUUID(), agentId, projectId, taskId, category:String(category).slice(0,120), message:String(message).slice(0,2000), severity:['low','medium','high','critical'].includes(severity)?severity:'medium', resolution:boundedText(resolution,2000), resolved:Boolean(resolution), createdAt:stamp() };
}

export function normalizeEmployeeProfile(employee={}, { sop=[], knowledge=[], accessScope={}, history=[], evaluations=[], recommendations=[] }={}) {
  const id=String(employee.employee_id||employee.agentId||employee.id||'').trim();
  if (!id) throw new Error('employee id is required');
  const role=String(employee.id||employee.agentId||employee.roleId||'').toLowerCase();
  const roleSop=role.includes('qa')||role.includes('quality')||role.includes('imam')?'quality':role.includes('admin')||role.includes('operation')?'admin':role.includes('marketing')||role.includes('copy')||role.includes('seo')||role.includes('ads')?'marketing':role.includes('design')?'graphic_designer':role.includes('video')||role.includes('editor')?'video_editor':role.includes('developer')||role.includes('programmer')?'developer':'director';
  return { employeeId:id, name:String(employee.employee_name||employee.name||id).slice(0,200), jobTitle:String(employee.job_title||employee.role||'').slice(0,200), department:String(employee.department||employee.departmentId||'').slice(0,120), model:employee.model||employee.model_identifier||null, configVersion:String(employee.configVersion||'unversioned').slice(0,80), skills:Array.isArray(employee.skills||employee.capabilities)?[...new Set((employee.skills||employee.capabilities).map(String))].slice(0,100):[], jobDescription:String(employee.jobDescription||employee.description||'').slice(0,4000), sop:Array.isArray(sop)&&sop.length?sop.slice(0,50):(PROFESSIONAL_SOPS[roleSop]||PROFESSIONAL_SOPS.director).slice(0,50), knowledge:Array.isArray(knowledge)?knowledge.slice(0,100):[], allowedTools:Array.isArray(employee.allowed_tools||employee.allowedTools)?[...new Set((employee.allowed_tools||employee.allowedTools).map(String))].slice(0,100):[], accessScope:accessScope&&typeof accessScope==='object'?structuredClone(accessScope):{}, taskHistory:Array.isArray(history)?history.slice(-100):[], evaluations:Array.isArray(evaluations)?evaluations.slice(-100):[], improvementRecommendations:Array.isArray(recommendations)?recommendations.slice(-50):[], updatedAt:stamp() };
}

export function improvementRecommendation({ agentId, dimension, evidence=[], action, priority='medium' }={}) {
  if (!agentId || !dimension || !action) throw new Error('agentId, dimension and action required');
  return { id:randomUUID(), agentId, dimension:String(dimension).slice(0,120), evidence:Array.isArray(evidence)?evidence.slice(0,20):[], action:String(action).slice(0,1000), priority:['low','medium','high'].includes(priority)?priority:'medium', status:'proposed', createdAt:stamp() };
}

export function createVersionManager() {
  const data = new Map();
  function publish(kind, key, value, metadata={}) {
    if (!kind || !key) throw new Error('kind and key required');
    const list=data.get(`${kind}:${key}`)||[]; const version=list.length+1;
    const row={ id:randomUUID(), kind:String(kind).slice(0,80),key:String(key).slice(0,200),version,value:structuredClone(value),metadata:structuredClone(metadata||{}),active:true,createdAt:stamp() };
    list.forEach(v=>v.active=false); list.push(row); data.set(`${kind}:${key}`,list); return row;
  }
  function get(kind,key,{version}={}) { const list=data.get(`${kind}:${key}`)||[]; const row=version?list.find(v=>v.version===version)||null:list.find(v=>v.active)||null; return row?structuredClone(row):null; }
  function rollback(kind,key,version) { if(!Number.isInteger(version)||version<1) throw new Error('Version not found'); const row=get(kind,key,{version}); if(!row) throw new Error('Version not found'); const list=data.get(`${kind}:${key}`); list.forEach(v=>v.active=v.version===version); return structuredClone(row); }
  function list(kind,key) { return structuredClone([...(data.get(`${kind}:${key}`)||[])]); }
  return { publish,get,rollback,list, snapshot:()=>[...data.values()].flat() };
}

export function runBenchmark({ benchmarkId, agentId, evaluator, cases=[] }={}) {
  if (!benchmarkId || !agentId || typeof evaluator!=='function') throw new Error('benchmarkId, agentId and evaluator required');
  const testCases=Array.isArray(cases)?cases.slice(0,200):[];
  const results=testCases.map((input,index)=>{ try { const out=evaluator(input); const raw=typeof out?.score==='number'&&Number.isFinite(out.score)?out.score:null; return { index, passed:Boolean(out?.passed ?? out===true), score:raw===null?null:Math.max(0,Math.min(10,raw)), evidence:out?.evidence||null }; } catch(error) { return { index, passed:false, score:null, error:String(error?.message||error).slice(0,500) }; } });
  const scored=results.filter(r=>r.score!==null); return { id:randomUUID(), benchmarkId, agentId, results, passRate:results.length?results.filter(r=>r.passed).length/results.length:null, score:scored.length?scored.reduce((a,r)=>a+r.score,0)/scored.length:null, createdAt:new Date().toISOString() };
}

