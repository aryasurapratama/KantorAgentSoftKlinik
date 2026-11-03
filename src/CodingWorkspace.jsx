import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, FolderOpen, Play, RefreshCw, Save, Square, Terminal, CheckCircle2, AlertCircle, LoaderCircle } from 'lucide-react';
import './CodingWorkspace.css';

const statusText = { queued: 'Menunggu', running: 'Berjalan', completed: 'Selesai', failed: 'Gagal', cancelled: 'Dibatalkan' };
const statusClass = (value) => `coding-status ${value || 'unknown'}`;

function CodingWorkspace({ api, agents = [], initialAgentId = 'developer' }) {
  const [data, setData] = useState({ settings: {}, tools: {}, router: {}, jobs: [] });
  const [form, setForm] = useState({ workspacePath: '', model: '', baseUrl: '' });
  const [agentId, setAgentId] = useState(initialAgentId);
  const [instruction, setInstruction] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [handoffPath, setHandoffPath] = useState('');
  const initialized = useRef(false);
  const formTouched = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await api('/api/coding');
      const normalized = { settings: result.settings || {}, tools: result.tools || {}, router: result.router || {}, jobs: result.jobs || [], activeJobId: result.activeJobId || null };
      setData(normalized);
      if (!initialized.current && !formTouched.current) {
        setForm({ workspacePath: normalized.settings.workspacePath || '', model: normalized.settings.model || '', baseUrl: normalized.settings.baseUrl || '' });
        initialized.current = true;
      }
      return normalized;
    } catch (error) { setMessage({ type: 'error', text: error.message }); }
  }, [api]);
  useEffect(() => { load(); const timer = setInterval(load, 2500); return () => clearInterval(timer); }, [load]);
  useEffect(() => { if (agents.length && !agents.some((agent) => agent.id === agentId)) setAgentId(agents[0].id); }, [agents, agentId]);

  const save = async (event) => {
    event?.preventDefault(); setBusy(true); setMessage(null);
    try { const result = await api('/api/coding/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); if (result.settings) setForm({ workspacePath: result.settings.workspacePath || '', model: result.settings.model || '', baseUrl: result.settings.baseUrl || '' }); formTouched.current = false; initialized.current = true; await load(); setMessage({ type: 'success', text: 'Pengaturan workspace tersimpan.' }); }
    catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const testRouter = async () => {
    setTesting(true); setMessage(null);
    try { const result = await load(); if (result) setMessage({ type: result.router.ok ? 'success' : 'error', text: result.router.message || (result.router.ok ? '9Router terhubung. Status alat diperbarui.' : '9Router belum terhubung.') }); }
    catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setTesting(false); }
  };
  const openVSCode = async () => {
    setBusy(true); setMessage(null);
    try { const result = await api('/api/coding/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId, instruction: instruction.trim() || undefined }) }); setHandoffPath(result.handoffPath || ''); setMessage({ type: result.ok === false ? 'error' : 'success', text: result.message || 'Workspace dibuka di VSCode. Lanjutkan melalui extension Codex.' }); }
    catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const runJob = async (event) => {
    event.preventDefault(); if (!instruction.trim()) return;
    setBusy(true); setMessage(null);
    try { const result = await api('/api/coding/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId, instruction: instruction.trim() }) }); setInstruction(''); setExpanded(result.job?.id || result.id || null); setMessage({ type: 'success', text: 'Coding lokal dimulai. Pantau log di bawah.' }); await load(); }
    catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const cancelJob = async (id) => {
    try { await api(`/api/coding/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); await load(); }
    catch (error) { setMessage({ type: 'error', text: error.message }); }
  };
  const copyHandoff = async () => {
    if (!handoffPath) return;
    try { await navigator.clipboard.writeText(handoffPath); setMessage({ type: 'success', text: 'Path handoff disalin.' }); }
    catch { setMessage({ type: 'error', text: 'Clipboard tidak tersedia. Salin path secara manual.' }); }
  };
  const jobs = useMemo(() => data.jobs || [], [data.jobs]);
  const modelOptions = data.router?.models || data.router?.availableModels || [];
  const tool = (key) => data.tools?.[key] || data[key] || {};
  const toolOK = (key) => Boolean(tool(key)?.ok ?? tool(key)?.available ?? tool(key)?.installed);
  // Windows APIs return saved paths with backslashes while browser inputs often
  // provide forward slashes. Treat equivalent separators as the same value so
  // a valid saved workspace does not remain falsely marked as unsaved.
  const comparable = (key, value) => {
    const text = String(value || '');
    if (key === 'workspacePath') return text.split('\\').join('/').replace(/\/+$/, '');
    if (key === 'baseUrl') return text.replace(/\/+$/, '');
    return text;
  };
  const dirty = Object.keys(form).some((key) => comparable(key, form[key]) !== comparable(key, data.settings[key]));

  return <section className="coding-workspace">
    <div className="coding-hero"><div><p className="eyebrow">LOCAL DEVELOPMENT · EMPLOYEE STUDIO</p><h2><Code2 size={24} /> Studio Coding</h2><p>Kerjakan kode di folder lokal memakai VSCode, Codex CLI, dan 9Router.</p></div><button className="secondary-button" onClick={load} disabled={busy}><RefreshCw size={15} /> Muat ulang</button></div>
    {message && <div className={`coding-alert ${message.type}`} role="status">{message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{message.text}</div>}
    {handoffPath && <p className="coding-handoff">Catatan untuk extension Codex: <code>{handoffPath}</code> <button type="button" className="text-button" onClick={copyHandoff}>Salin path</button></p>}
    {dirty && <p className="coding-provider-note">Pengaturan berubah. Simpan sebelum membuka editor atau menjalankan coding.</p>}
    <div className="coding-grid">
      <section className="panel coding-config"><div className="panel-heading"><div><h3>Workspace & model</h3><p>Jalur ini dipakai proses lokal Codex.</p></div><Terminal size={18} className="muted-icon" /></div><form onSubmit={save}>
        <label>Folder proyek<input required value={form.workspacePath} onChange={(e) => { formTouched.current = true; setForm({ ...form, workspacePath: e.target.value }); }} placeholder="C:\\Projects\\aplikasi" /><small>Gunakan path absolut di komputer karyawan.</small></label>
        <label>Model Codex<input required list="coding-models" value={form.model} onChange={(e) => { formTouched.current = true; setForm({ ...form, model: e.target.value }); }} placeholder="ID model dari 9Router" /><datalist id="coding-models">{modelOptions.map((item) => <option key={typeof item === 'string' ? item : item.id} value={typeof item === 'string' ? item : item.id} />)}</datalist><small>Pilih model terdeteksi atau isi ID model lengkap.</small></label>
        <label>Base URL 9Router<input value={form.baseUrl} onChange={(e) => { formTouched.current = true; setForm({ ...form, baseUrl: e.target.value }); }} placeholder="http://127.0.0.1:20128/v1" /></label>
        <p className="coding-provider-note">9Router berjalan sebagai gateway lokal. Instruksi dan kode dapat dikirim ke penyedia model online yang terhubung.</p>
        <div className="coding-actions"><button className="primary-button" type="submit" disabled={busy}><Save size={15} /> Simpan</button><button className="secondary-button" type="button" onClick={testRouter} disabled={testing}>{testing ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Tes tersimpan</button></div>
      </form></section>
      <section className="panel coding-tools"><div className="panel-heading"><div><h3>Status alat</h3><p>Deteksi lokal sebelum menjalankan pekerjaan.</p></div><Code2 size={18} className="muted-icon" /></div><div className="tool-status"><div><span className={toolOK('vscode') ? 'tool-dot ok' : 'tool-dot'} /><strong>VSCode</strong><small>{tool('vscode')?.message || tool('vscode')?.version || (toolOK('vscode') ? 'Terdeteksi' : 'Belum terdeteksi')}</small></div><div><span className={toolOK('codex') ? 'tool-dot ok' : 'tool-dot'} /><strong>Codex CLI</strong><small>{tool('codex')?.message || tool('codex')?.version || (toolOK('codex') ? 'Terdeteksi' : 'Belum terdeteksi')}</small></div><div><span className={data.router?.ok ? 'tool-dot ok' : 'tool-dot'} /><strong>9Router</strong><small>{data.router?.message || (data.router?.ok ? 'Gateway siap' : 'Belum terhubung')}</small></div></div><button className="secondary-button wide" onClick={openVSCode} disabled={busy || dirty || !form.workspacePath}><FolderOpen size={15} /> Buka VSCode</button><p className="form-note">Folder dan catatan instruksi dibuka di editor. Teruskan catatan ke extension Codex secara manual. Tombol Mulai coding lokal menjalankan Codex CLI sebagai proses background.</p></section>
    </div>
    <section className="panel coding-run"><div className="panel-heading"><div><h3>Jalankan coding lokal</h3><p>Codex membaca dan mengubah file di folder workspace sesuai instruksi Anda.</p></div><Play size={18} className="muted-icon" /></div><form className="coding-run-form" onSubmit={runJob}><label>Karyawan / agen<select value={agentId} onChange={(e) => setAgentId(e.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name || agent.role || agent.id}</option>)}{!agents.length && <option value="developer">Developer</option>}</select></label><label className="instruction-field">Instruksi<textarea required rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Contoh: Perbaiki bug validasi login, jalankan test terkait, lalu jelaskan perubahan." /></label><button className="primary-button" type="submit" disabled={busy || dirty || Boolean(data.activeJobId) || !form.workspacePath || !instruction.trim()}><Play size={15} /> Mulai coding lokal</button></form><p className="form-note">Perubahan file dan perintah terminal terjadi di komputer Anda. Tinjau hasil sebelum commit atau deploy.</p></section>
    <section className="panel coding-jobs"><div className="panel-heading"><div><h3>Riwayat coding</h3><p>{jobs.length} pekerjaan sesi ini. Riwayat berakhir saat server dimulai ulang.</p></div><Terminal size={18} className="muted-icon" /></div>{jobs.length ? <div className="job-list">{jobs.map((job) => <article className="job-row" key={job.id}><button className="job-main" aria-expanded={expanded === job.id} onClick={() => setExpanded(expanded === job.id ? null : job.id)}><span><strong>{job.instruction || job.title || 'Pekerjaan coding'}</strong><small>{job.agentName || job.agentId || 'Developer'} · {job.createdAt ? new Date(job.createdAt).toLocaleString('id-ID') : ''}</small></span><span className={statusClass(job.status)}>{statusText[job.status] || job.status}</span></button>{['queued', 'running'].includes(job.status) && <button type="button" className="icon-button" title="Batalkan" aria-label={`Batalkan pekerjaan ${job.instruction || job.title || job.id}`} onClick={() => cancelJob(job.id)}><Square size={15} /></button>}{expanded === job.id && <div className="job-details">{job.logs && <pre>{Array.isArray(job.logs) ? job.logs.join('\n') : job.logs}</pre>}{job.result && <pre>{typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}</pre>}{job.error && <div className="inline-error">{job.error}</div>}{!job.logs && !job.result && !job.error && <span>Log belum tersedia.</span>}</div>}</article>)}</div> : <div className="empty-state"><Terminal size={26} /><strong>Belum ada pekerjaan coding</strong><p>Mulai dari instruksi kecil, lalu tinjau log dan hasilnya.</p></div>}</section>
  </section>;
}
export default CodingWorkspace;
