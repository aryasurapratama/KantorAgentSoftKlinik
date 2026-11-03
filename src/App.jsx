import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import OfficeView from './OfficeView';
import CodingWorkspace from './CodingWorkspace';
import OperationsWorkspace from './OperationsWorkspace';
import { Activity, ArrowUpRight, BarChart3, BookOpen, Bot, Code2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3, Download, FileText, Github, Globe2, Layers3, LayoutDashboard, ListTodo, LoaderCircle, Menu, MessageSquare, Plus, Send, Settings, ShieldCheck, Share2, Sparkles, Trash2, Upload, Users, Wifi, X, AlertCircle } from 'lucide-react';

const labels = { queued: 'Menunggu', running: 'Dikerjakan', completed: 'Selesai', failed: 'Gagal', cancelled: 'Dibatalkan' };
const colors = { director: 'violet', admin: 'teal', marketing: 'amber', developer: 'blue' };
const examples = { director: 'Susun prioritas pengembangan bisnis Softklinik Harmes untuk minggu ini.', admin: 'Susun jadwal proyek pengembangan Softklinik Harmes minggu ini.', marketing: 'Analisis kebutuhan fitur pendaftaran pasien untuk software klinik.', developer: 'Bantu susun rencana pengembangan fitur jadwal dokter pada software klinik.' };
const teamCommand = (value) => /\b(?:tim|team|suruh|pimpinan|semua|bersama|diskusi(?:kan)?|audit(?:kan)?|codingan|kode|sistem|kantor\s+ai|kembangkan|pengembangan|implementasikan|optimalkan|tingkatkan|majukan)\b/i.test(value) && /\b(?:tolong|coba|bantu|minta|kerjakan|buat|bikin|susun|rancang|jalankan|mulai|bangun|kembangkan|implementasikan|tambahkan|perbaiki|ubah|audit|cek|uji|tingkatkan|optimalkan|majukan|diskusikan|bahas)\b/i.test(value);
const integrationProviders = [{ id: 'telegram', name: 'Telegram', detail: 'Bot dan pengiriman pesan', icon: Send }, { id: 'github', name: 'GitHub', detail: 'Profil dan repository', icon: Github }, { id: 'web', name: 'Website / CMS', detail: 'Konten WordPress', icon: Globe2 }, { id: 'social', name: 'Media sosial', detail: 'Konfigurasi akun', icon: Share2 }];
const date = (value, options) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...options }).format(new Date(value));
const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
let sessionRequest;
function session() {
  sessionRequest ||= fetch('/api/session', { credentials: 'same-origin', headers: { 'X-Harmes-Bootstrap': '1' } }).then(async (response) => {
    if (!response.ok) throw new Error('Sesi aplikasi gagal dimulai.');
    return response.json();
  }).catch((error) => { sessionRequest = null; throw error; });
  return sessionRequest;
}
async function api(url, options, retried = false) {
  const { csrfToken } = await session();
  const mutation = options?.method && !['GET', 'HEAD'].includes(options.method.toUpperCase());
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { ...options?.headers, ...(mutation ? { 'X-CSRF-Token': csrfToken } : {}) } });
  const data = await response.json().catch(() => ({}));
  if (!retried && (response.status === 401 || (response.status === 403 && data.error === 'Token keamanan tidak valid. Muat ulang aplikasi.'))) { sessionRequest = null; return api(url, options, true); }
  if (!response.ok) throw new Error(data.error || data.message || `Permintaan gagal (${response.status}).`);
  return data;
}
const json = (body, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function Avatar({ agent }) { return <div className={`agent-avatar ${colors[agent?.id] || 'violet'}`}>{agent?.initials || 'AI'}</div>; }
// Markdown is model-authored content. Keep links explicit and prevent remote
// image URLs from loading automatically (which could leak prompts or business
// context through a third-party request).
function markdownUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value, window.location.href);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch { return null; }
}
function Markdown({ children }) {
  return <div className="markdown"><ReactMarkdown components={{
    a: ({ href, children: linkChildren }) => {
      const url = markdownUrl(href);
      return url ? <a href={url} target="_blank" rel="noopener noreferrer">{linkChildren}</a> : <span>{linkChildren}</span>;
    },
    img: ({ src, alt }) => {
      const url = markdownUrl(src);
      return url
        ? <span className="markdown-image-link">Gambar tidak dimuat otomatis. <a href={url} target="_blank" rel="noopener noreferrer">Buka gambar{alt ? `: ${alt}` : ''}</a></span>
        : <span className="markdown-image-link">Gambar diblokir{alt ? `: ${alt}` : ''}</span>;
    },
  }}>{children || ''}</ReactMarkdown></div>;
}
function PerformancePanel({ performance }) {
  const agents = Array.isArray(performance?.agents) ? performance.agents : [];
  return <section className="panel performance-panel"><div className="panel-heading"><div><h2>Performa karyawan</h2><p>Skor berasal dari tugas dan evaluasi tersimpan.</p></div><BarChart3 size={17} className="muted-icon" /></div>{agents.length ? <div className="performance-list">{agents.slice(0, 12).map((item) => <div className="performance-row" key={item.agentId || item.employee_id}><strong>{item.employee_id || item.agentId}</strong><span>{item.evaluation_score == null ? 'Belum ada bukti' : `${item.evaluation_score}/10`}</span><small>{item.evaluation?.limitations?.join(' ') || item.readiness || '—'}</small></div>)}</div> : <p className="form-note">Data performa belum tersedia.</p>}</section>;
}
function Modal({ title, subtitle, close, children, wide }) {
  const dialog = useRef(null);
  const previousFocus = useRef(document.activeElement);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const element = dialog.current;
    const isTop = () => [...document.querySelectorAll('[aria-modal="true"]')].at(-1) === element;
    const focusable = () => [...element.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter((item) => item.getClientRects().length);
    const focusFirst = () => (focusable()[0] || element).focus();
    if (!element.contains(document.activeElement)) focusFirst();
    const keydown = (event) => {
      if (!isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); element.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const focusin = (event) => { if (isTop() && !element.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      queueMicrotask(() => { if (previousFocus.current?.isConnected && !previousFocus.current.closest('[inert]')) previousFocus.current.focus({ preventScroll: true }); });
    };
  }, []);
  return <div className="modal-backdrop" onClick={close}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}><div className="modal-head"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h2>{title}</h2></div><button className="icon-button" aria-label="Tutup" onClick={close}><X size={19} /></button></div>{children}</section></div>;
}
function App() {
  const [view, setView] = useState(() => { const params = new URLSearchParams(window.location.search); const requested = params.get('view'); return ['office', 'dashboard', 'tasks', 'team', 'insights', 'knowledge', 'coding', 'projects'].includes(requested) ? requested : params.get('mode') === '3d' ? 'office' : 'dashboard'; });
  const [officeMode, setOfficeMode] = useState(() => { const requested = new URLSearchParams(window.location.search).get('mode'); if (['3d', 'lite'].includes(requested)) return requested; try { return localStorage.getItem('harmes.office.mode.v3') === '3d' ? '3d' : 'lite'; } catch { return 'lite'; } });
  const [state, setState] = useState({ agents: [], tasks: [], messages: [], activity: [], settings: {} });
  const [performance, setPerformance] = useState({ agents: [], benchmarks: [], intelligence: null });
  const [loaded, setLoaded] = useState(false);
  const [server, setServer] = useState(false);
  const [connection, setConnection] = useState(null);
  const [routerStatus, setRouterStatus] = useState(null);
  const [error, setError] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('director');
  const [codingAgentId, setCodingAgentId] = useState('developer');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(null);
  const [chatMode, setChatMode] = useState(null);
  const [taskForm, setTaskForm] = useState(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskActionBusy, setTaskActionBusy] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [integrations, setIntegrations] = useState(null);
  const [integrationCatalog, setIntegrationCatalog] = useState({ connectors: [], providers: integrationProviders });
  const [integrationsMessage, setIntegrationsMessage] = useState('');
  const [integrationSetup, setIntegrationSetup] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentForm, setDocumentForm] = useState({ name: '', content: '' });
  const [documentsBusy, setDocumentsBusy] = useState(false);
    const [ingestUrl, setIngestUrl] = useState('');
    const [ingestTags, setIngestTags] = useState('');
  const [integrationResult, setIntegrationResult] = useState(null);
  const [repository, setRepository] = useState('');
  const [githubRepos, setGithubRepos] = useState([]);
  const [githubSelected, setGithubSelected] = useState([]);
  const [telegramDraft, setTelegramDraft] = useState({ chatId: '', text: '' });
  const [pendingAction, setPendingAction] = useState(null);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [officeChat, setOfficeChat] = useState(false);
  const [filter, setFilter] = useState('all');
  const [rosterSearch, setRosterSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const chatEnd = useRef(null);
  const inputRef = useRef(null);
  const drawerRosterRef = useRef(null);
  const sidebarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const pendingChatRequest = useRef(null);
  const githubPopupRef = useRef(null);
  const refresh = useCallback(async () => {
    try { const data = await api('/api/state'); setState(data); setServer(true); setLoaded(true); }
    catch { setServer(false); setLoaded(true); }
  }, []);
  const testConnection = useCallback(async () => {
    try { const result = await api('/api/connection/test', { method: 'POST' }); setConnection(result); return result; }
    catch (e) { const result = { ok: false, message: e.message, models: [] }; setConnection(result); return result; }
  }, []);
  const testRouterStatus = useCallback(async () => {
    try {
      const result = await api('/api/router/status');
      setRouterStatus(result);
      return result;
    } catch (e) {
      const result = { ok: false, message: e.message, models: [], modelCount: 0 };
      setRouterStatus(result);
      return result;
    }
  }, []);
  useEffect(() => {
    const update = () => { if (!document.hidden) refresh(); };
    const health = () => { if (!document.hidden) testConnection(); };
    const routerHealth = () => { if (!document.hidden) testRouterStatus(); };
    update(); health(); routerHealth();
    const interval = Math.max(10, Number(state.settings?.routerMonitoring?.intervalSeconds) || 30);
    const timer = setInterval(update, 2000), healthTimer = setInterval(health, 30000), routerTimer = setInterval(routerHealth, interval * 1000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); clearInterval(healthTimer); clearInterval(routerTimer); document.removeEventListener('visibilitychange', update); };
  }, [refresh, testConnection, testRouterStatus, state.settings?.routerMonitoring?.intervalSeconds]);
  const agents = state.agents;
  const departments = state.departments?.length ? state.departments : [...new Map(agents.filter((item) => item.departmentId).map((item) => [item.departmentId, { id: item.departmentId, name: item.department || item.departmentId }])).values()];
  const visibleAgents = agents.filter((item) => (departmentFilter === 'all' || item.departmentId === departmentFilter) && [item.name, item.role, item.description, item.department].join(' ').toLocaleLowerCase('id-ID').includes(rosterSearch.trim().toLocaleLowerCase('id-ID')));
  const allGroups = [...departments, ...(agents.some((item) => !item.departmentId) ? [{ id: '', name: 'Tim AI' }] : [])];
  const rosterGroups = allGroups.map((department) => ({ ...department, members: visibleAgents.filter((item) => (item.departmentId || '') === department.id) })).filter((department) => department.members.length);
  const assignmentName = (id) => id === 'team' ? 'Tim inti' : id?.startsWith('department:') ? departments.find((item) => item.id === id.slice(11))?.name || 'Departemen' : agents.find((item) => item.id === id)?.role || 'Agen AI';
  const rosterControls = <div className="roster-controls"><input type="search" aria-label="Cari anggota tim" placeholder="Cari nama, keahlian, atau peran…" value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} /><select aria-label="Filter departemen" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">Semua departemen ({agents.length})</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>;
  const agent = agents.find((item) => item.id === selectedAgent) || agents[0];
  const messages = state.messages.filter((message) => message.agentId === agent?.id);
  const task = state.tasks.find((item) => item.id === taskId);
  const modalOpen = Boolean(taskForm || task || settingsForm || integrationSetup || integrations || help);
  useEffect(() => {
    if (!modalOpen) return;
    const background = [...document.querySelectorAll('.app-shell > :not(.modal-backdrop)')];
    const previous = background.map((element) => element.inert);
    const overflow = document.body.style.overflow;
    background.forEach((element) => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    return () => { background.forEach((element, index) => { element.inert = previous[index]; }); document.body.style.overflow = overflow; };
  }, [modalOpen]);
  useEffect(() => {
    if (!menu || view === 'office' || modalOpen || !window.matchMedia('(max-width: 680px)').matches) return;
    const element = sidebarRef.current, main = document.querySelector('.main-content');
    const previousFocus = menuButtonRef.current || document.activeElement, overflow = document.body.style.overflow;
    const items = () => [...element.querySelectorAll('button:not(:disabled), a[href]')].filter((item) => item.getClientRects().length);
    const first = () => items()[0]?.focus();
    first();
    if (main) main.inert = true;
    document.body.style.overflow = 'hidden';
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(false); return; }
      if (event.key !== 'Tab') return;
      const controls = items(), start = controls[0], end = controls.at(-1);
      if (event.shiftKey && (document.activeElement === start || !element.contains(document.activeElement))) { event.preventDefault(); end?.focus(); }
      else if (!event.shiftKey && (document.activeElement === end || !element.contains(document.activeElement))) { event.preventDefault(); start?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    const resize = () => { if (!window.matchMedia('(max-width: 680px)').matches) setMenu(false); };
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('keydown', keydown); window.removeEventListener('resize', resize); if (main) main.inert = false; document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [menu, view, modalOpen]);
  useEffect(() => {
    if (!officeChat || view !== 'office' || modalOpen) return;
    const close = (event) => { if (event.key === 'Escape') { event.preventDefault(); setOfficeChat(false); document.querySelector('.office-view iframe')?.focus(); } };
    drawerRef.current?.querySelector('.close-drawer')?.focus({ preventScroll: true });
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [officeChat, view, modalOpen]);
  const pending = state.tasks.filter((item) => ['queued', 'running'].includes(item.status));
  const completed = state.tasks.filter((item) => item.status === 'completed');
  const isRouter = state.settings.provider === '9router';
  const isLocal = state.settings.provider === 'ollama';
  const routerMonitoring = state.settings.routerMonitoring || {};
  const routerDashboardUrl = routerMonitoring.dashboardUrl || 'http://localhost:20128/dashboard';
  const connectedIntegrations = integrationCatalog.connectors.filter((item) => item.connected && item.enabled !== false);
  const tasks = state.tasks.filter((item) => filter === 'all' || (filter === 'active' ? ['queued', 'running'].includes(item.status) : item.status === filter));
  const finishedTasks = state.tasks.filter((item) => ['completed', 'failed'].includes(item.status));
  const completionRate = finishedTasks.length ? Math.round((completed.length / finishedTasks.length) * 100) : 0;
  const userMessages = state.messages.filter((item) => item.role === 'user');
  const departmentInsights = departments.map((department) => {
    const members = agents.filter((item) => item.departmentId === department.id);
    const memberIds = new Set(members.map((item) => item.id));
    const assigned = state.tasks.filter((item) => item.agentId === `department:${department.id}` || memberIds.has(item.agentId) || (item.agentId === 'team' && (item.steps?.length ? item.steps.some((step) => memberIds.has(step.agentId)) : ['director', 'admin', 'marketing', 'developer'].some((id) => memberIds.has(id)))));
    return { ...department, members: members.length, tasks: assigned.length, completed: assigned.filter((item) => item.status === 'completed').length };
  });
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' }); }, [messages.length, sending]);
  useEffect(() => { if (officeChat) drawerRosterRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [officeChat, selectedAgent, rosterSearch, departmentFilter]);
  useEffect(() => { if (server) api('/api/integrations').then(setIntegrationCatalog).catch(() => {}); }, [server, state.settings.integrationCount]);
  useEffect(() => { if (server) api('/api/performance').then(setPerformance).catch(() => {}); }, [server, state.tasks.length]);
  function navigate(next) { setView(next); setMenu(false); const address = new URL(window.location.href); address.searchParams.set('view', next); window.history.replaceState(null, '', address); window.scrollTo({ top: 0 }); }
  function openChat(id) { setSelectedAgent(id); if (view === 'office') { setRosterSearch(''); setDepartmentFilter(agents.find((item) => item.id === id)?.departmentId || 'all'); setOfficeChat(true); } else navigate('dashboard'); setTimeout(() => { inputRef.current?.closest('.chat-panel')?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }); inputRef.current?.focus({ preventScroll: true }); }, 80); }
  async function send(event) {
    event.preventDefault(); const content = draft.trim(); if (!content || sending || !agent) return;
    const agentId = agent.id;
    const requestId = pendingChatRequest.current?.agentId === agentId && pendingChatRequest.current?.content === content ? pendingChatRequest.current.requestId : crypto.randomUUID();
    const directorCommand = agentId === 'director' && /\b(?:tolong|coba|bantu|minta|kerjakan|buat|bikin|susun|rancang|jalankan|mulai|bangun|kembangkan|implementasikan|tambahkan|perbaiki|ubah|audit|cek|uji|tingkatkan|optimalkan|majukan|diskusikan|bahas)\b/i.test(content) && !/^(?:apa|apakah|bagaimana|gimana|kenapa|mengapa|bisakah|bolehkah|jelaskan|ceritakan|menurut)\b/i.test(content);
    pendingChatRequest.current = { agentId, content, requestId }; setSending(agentId); setChatMode(teamCommand(content) || directorCommand ? 'team' : 'agent'); setDraft(''); setError('');
    try { await api('/api/chat', json({ agentId, message: content, requestId })); pendingChatRequest.current = null; await refresh(); }
    catch (e) { setError(e.message); setDraft(content); await refresh(); }
    finally { setSending(null); setChatMode(null); }
  }
  async function createTask(event) {
    event.preventDefault(); if (!taskForm.title.trim() || taskBusy) return;
    setTaskBusy(true); setError('');
    try { const payload = { ...taskForm, scheduledAt: taskForm.scheduledAt ? new Date(taskForm.scheduledAt).toISOString() : undefined }; const result = await api('/api/tasks', json(payload)); setTaskForm(null); setTaskId(result.task.id); await refresh(); }
    catch (e) { setError(e.message); } finally { setTaskBusy(false); }
  }
  async function changeTask(action) {
    if (!task || taskActionBusy) return;
    if (action === 'delete' && !window.confirm(`Hapus tugas "${task.title}" beserta hasilnya dari aplikasi?`)) return;
    setTaskActionBusy(true); setError('');
    try { await api(`/api/tasks/${encodeURIComponent(task.id)}${action === 'delete' ? '' : '/' + action}`, action === 'delete' ? { method: 'DELETE' } : json({})); if (action === 'delete') setTaskId(null); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setTaskActionBusy(false); }
  }
  async function clearChat() {
    if (!agent || sending || !window.confirm(`Hapus seluruh percakapan dengan ${agent.name} dari aplikasi?`)) return;
    try { await api(`/api/messages?agentId=${encodeURIComponent(agent.id)}`, { method: 'DELETE' }); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function downloadWorkspace() {
    try {
      const backup = await api('/api/backup');
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `kantor-ai-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  }
  async function restoreWorkspace(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || settingsBusy) return;
    if (file.size > 32 * 1024 * 1024) { setSettingsMessage('Cadangan maksimal 32 MB.'); return; }
    let backup;
    try { backup = JSON.parse(await file.text()); } catch { setSettingsMessage('Berkas cadangan bukan JSON yang valid.'); return; }
    if (!window.confirm('Pulihkan cadangan ini? Seluruh chat, tugas, dan dokumen saat ini akan diganti. Pengaturan penyedia dan token tetap tersimpan. Ekspor cadangan saat ini terlebih dahulu bila masih diperlukan.')) return;
    setSettingsBusy(true);
    try { await api('/api/backup/restore', json({ backup, approved: true })); await refresh(); await loadDocuments(); setTaskId(null); setSettingsMessage('Cadangan berhasil dipulihkan.'); }
    catch (e) { setSettingsMessage(e.message); }
    finally { setSettingsBusy(false); }
  }
  const officeAction = useCallback((message) => {
    if (message.action === '3d' || message.action === 'lite') { setOfficeMode(message.action); const address = new URL(window.location.href); address.searchParams.set('mode', message.action); window.history.replaceState(null, '', address); try { localStorage.setItem('harmes.office.mode.v3', message.action); } catch {} }
    else if (message.action === 'task') { setError(''); setTaskForm({ title: '', description: '', agentId: message.agentId || 'team', scheduledAt: '' }); }
    else if (message.action === 'settings') { setSettingsMessage(''); setSettingsForm({ ...state.settings, apiKey: '' }); }
    else if (message.action === 'workspace') { setOfficeChat(false); setView('dashboard'); }
    else if (message.action === 'chat') { const chatAgent = state.agents.find((item) => item.id === (message.agentId || selectedAgent)); if (chatAgent) setSelectedAgent(chatAgent.id); setRosterSearch(''); setDepartmentFilter(chatAgent?.departmentId || 'all'); setOfficeChat(true); setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80); }
    else if (message.action === 'result' && state.tasks.some((item) => item.id === message.taskId)) setTaskId(message.taskId);
  }, [state.settings, state.tasks, state.agents, selectedAgent]);
  const newTask = () => { setError(''); setTaskForm({ title: '', description: '', agentId: 'team', scheduledAt: '' }); };
  const openSettings = () => {
    setMenu(false); setSettingsMessage('');
    setSettingsForm({
      ...state.settings,
      routerMonitoring: { enabled: true, baseUrl: 'http://127.0.0.1:20128/v1', dashboardUrl: 'http://localhost:20128/dashboard', intervalSeconds: 30, ...(state.settings.routerMonitoring || {}) },
      apiKey: '',
    });
  };
  const openRouterSettings = () => {
    setMenu(false); setSettingsMessage('');
    const current = state.settings || {};
    setSettingsForm({
      ...current,
      provider: '9router',
      baseUrl: current.provider === '9router' && current.baseUrl ? current.baseUrl : 'http://127.0.0.1:20128/v1',
      model: current.provider === '9router' ? current.model || '' : '',
      routerMonitoring: { enabled: true, baseUrl: 'http://127.0.0.1:20128/v1', dashboardUrl: 'http://localhost:20128/dashboard', intervalSeconds: 30, ...(current.routerMonitoring || {}) },
      apiKey: '',
    });
  };
  async function openIntegrations(preserveMessage = false) {
    if (!preserveMessage) setIntegrationsMessage('');
    setMenu(false);
    try { const result = await api('/api/integrations'); setIntegrations(result); setIntegrationCatalog(result); }
    catch (e) { setIntegrations(integrationCatalog); setIntegrationsMessage(e.message); }
  }
  async function openProvider(id) {
    setMenu(false);
    let catalog = integrationCatalog;
    try { catalog = await api('/api/integrations'); setIntegrationCatalog(catalog); } catch (e) { setError(e.message); }
    const provider = catalog.providers.find((item) => item.id === id) || integrationProviders.find((item) => item.id === id);
    connectIntegration({ ...provider, connector: catalog.connectors.find((item) => item.type === id) });
  }
  async function loadDocuments() {
    try { const result = await api('/api/documents'); setDocuments(result.documents || []); } catch (e) { setError(e.message); }
  }
  async function saveDocument(event) {
    event.preventDefault();
    if (!documentForm.name.trim() || !documentForm.content.trim() || documentsBusy) return;
    setDocumentsBusy(true);
    try { const name = /\.(txt|md|csv|json)$/i.test(documentForm.name.trim()) ? documentForm.name.trim() : documentForm.name.trim() + '.txt'; await api('/api/documents', json({ name, content: documentForm.content })); setDocumentForm({ name: '', content: '' }); await loadDocuments(); }
    catch (e) { setError(e.message); }
    finally { setDocumentsBusy(false); }
  }
    async function ingestDocument(event) {
      event.preventDefault(); if (!ingestUrl.trim() || documentsBusy) return; setDocumentsBusy(true);
      try { await api('/api/knowledge/ingest', json({ url: ingestUrl.trim(), tags: ingestTags.split(',').map((tag) => tag.trim()).filter(Boolean) })); setIngestUrl(''); setIngestTags(''); await loadDocuments(); }
      catch (e) { setError(e.message); } finally { setDocumentsBusy(false); }
    }
  async function uploadDocument(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 100000) { setError('Dokumen maksimal 100 KB.'); return; }
    try { setDocumentForm({ name: file.name, content: await file.text() }); } catch (e) { setError(e.message); }
  }
  async function deleteDocument(id) {
    if (!window.confirm('Hapus dokumen ini dari basis pengetahuan?')) return;
    try { await api(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadDocuments(); } catch (e) { setError(e.message); }
  }
  async function connectIntegration(provider) {
    const rawProviderId = typeof provider === 'object' ? provider.id : provider;
    const providerId = rawProviderId === 'website' ? 'web' : rawProviderId;
    const oauth = typeof provider === 'object' && provider.oauth === true;
    setIntegrations(null); setIntegrationsMessage(''); setIntegrationResult(null); setPendingAction(null); setRepository(''); setGithubRepos([]); setTelegramDraft({ chatId: '', text: '' });
    const existing = typeof provider === 'object' ? provider.connector : null;
    setGithubSelected(existing?.allowedRepositories || []);
    setIntegrationSetup({ id: existing?.id, provider: providerId, oauth, githubApp: existing?.githubApp ?? (typeof provider === 'object' && provider.githubApp === true), name: existing?.name || (providerId === 'github' ? 'GitHub' : providerId === 'telegram' ? 'Telegram bot' : providerId === 'web' ? 'Website / CMS' : 'Media sosial'), baseUrl: existing?.baseUrl || (providerId === 'github' ? 'https://api.github.com' : ''), scopes: existing?.scopes || ['read'], token: '', telegramChatId: existing?.telegramChatId || '', ownerUserId: existing?.ownerUserId || '' });
  }
  async function startGithubOAuth() {
    const popup = window.open('about:blank', 'harmes-github-oauth', 'popup,width=620,height=720');
    if (!popup) { setIntegrationsMessage('Popup diblokir browser. Izinkan popup untuk melanjutkan.'); return; }
    githubPopupRef.current = popup;
    setSettingsBusy(true); setIntegrationsMessage('Membuka GitHub…');
    try {
      const redirectUri = new URL('/api/integrations/github/callback', window.location.origin).toString();
      const endpoint = integrationSetup?.githubApp ? '/api/github/app/authorize' : `/api/integrations/github/authorize?redirectUri=${encodeURIComponent(redirectUri)}`;
      const result = await api(endpoint);
      if (popup.closed) { setIntegrationsMessage('Jendela GitHub ditutup. Hubungkan kembali untuk melanjutkan.'); return; }
      popup.location.replace(result.url);
    } catch (e) { popup.close(); githubPopupRef.current = null; setIntegrationsMessage(e.message); } finally { setSettingsBusy(false); }
  }
  async function saveIntegration(event) {
    event.preventDefault(); if (!integrationSetup || !integrationSetup.name.trim()) return;
    if (integrationSetup.provider === 'github' && !integrationSetup.id) { setIntegrationsMessage('Hubungkan GitHub melalui tombol otorisasi browser.'); return; }
    setSettingsBusy(true); setIntegrationsMessage('Menyimpan konektor…');
    try { const verifyTelegram = integrationSetup.provider === 'telegram' && integrationSetup.token.trim(); const endpoint = verifyTelegram ? '/api/integrations/telegram/connect' : '/api/integrations'; await api(endpoint, json({ id: integrationSetup.id, type: integrationSetup.provider, name: integrationSetup.name, baseUrl: integrationSetup.baseUrl, token: integrationSetup.token, scopes: integrationSetup.scopes, chatId: integrationSetup.telegramChatId, ownerUserId: integrationSetup.ownerUserId })); setIntegrationSetup(null); await openIntegrations(); setIntegrationsMessage(verifyTelegram ? 'Telegram terhubung.' : 'Konektor tersimpan.'); }
    catch (e) { setIntegrationsMessage(e.message); } finally { setSettingsBusy(false); }
  }
  async function disconnectIntegration() {
    if (!integrationSetup?.id || settingsBusy || !window.confirm(`Hapus koneksi ${integrationSetup.name}?`)) return;
    setSettingsBusy(true);
    try { await api(`/api/integrations/${encodeURIComponent(integrationSetup.id)}`, { method: 'DELETE' }); setIntegrationSetup(null); await openIntegrations(); setIntegrationsMessage('Koneksi dihapus.'); }
    catch (e) { setIntegrationsMessage(e.message); }
    finally { setSettingsBusy(false); }
  }
  async function inspectIntegration() {
    if (!integrationSetup?.id || settingsBusy) return;
    setSettingsBusy(true); setIntegrationsMessage('Membaca data…'); setIntegrationResult(null);
    try { const response = await api(`/api/integrations/${encodeURIComponent(integrationSetup.id)}/inspect`, json({ repository: repository.trim() || undefined })); setIntegrationResult(response.result); setIntegrationsMessage('Data terbaru diterima dari penyedia.'); }
    catch (e) { setIntegrationsMessage(e.message); }
    finally { setSettingsBusy(false); }
  }
  async function loadGithubRepositories() {
    if (!integrationSetup?.id || integrationSetup.provider !== 'github' || settingsBusy) return;
    setSettingsBusy(true); setIntegrationsMessage('Memuat repository GitHub…');
    try { const response = await api(`/api/github/repositories?connectorId=${encodeURIComponent(integrationSetup.id)}&refresh=1`); setGithubRepos(response.repositories || []); setGithubSelected(response.selected || []); setIntegrationsMessage('Pilih repository yang boleh dikerjakan.'); }
    catch (e) { setIntegrationsMessage(e.message); } finally { setSettingsBusy(false); }
  }
  async function saveGithubRepositories() {
    if (!integrationSetup?.id || settingsBusy) return;
    setSettingsBusy(true); setIntegrationsMessage('Menyimpan akses repository…');
    try { await api('/api/github/repositories/select', json({ connectorId: integrationSetup.id, repositories: githubSelected })); setIntegrationsMessage('Repository terpilih tersimpan.'); }
    catch (e) { setIntegrationsMessage(e.message); } finally { setSettingsBusy(false); }
  }
  async function previewTelegram() {
    if (!integrationSetup?.id || settingsBusy || !telegramDraft.chatId.trim() || !telegramDraft.text.trim()) return;
    setSettingsBusy(true); setPendingAction(null);
    try { const response = await api(`/api/integrations/${encodeURIComponent(integrationSetup.id)}/actions`, json({ chatId: telegramDraft.chatId.trim(), text: telegramDraft.text.trim() })); setPendingAction(response.action); setIntegrationsMessage('Periksa tujuan dan isi pesan. Pesan dikirim hanya setelah persetujuan.'); }
    catch (e) { setIntegrationsMessage(e.message); }
    finally { setSettingsBusy(false); }
  }
  async function approveTelegram() {
    if (!pendingAction || settingsBusy) return;
    setSettingsBusy(true);
    try { await api(`/api/actions/${encodeURIComponent(pendingAction.id)}/approve`, json({ approved: true })); setPendingAction(null); setTelegramDraft({ chatId: '', text: '' }); setIntegrationsMessage('Pesan terkirim melalui Telegram.'); }
    catch (e) { setPendingAction(null); setIntegrationsMessage(e.message); }
    finally { setSettingsBusy(false); }
  }
  useEffect(() => {
    const receive = (event) => {
      if (event.origin !== window.location.origin || event.source !== githubPopupRef.current || !['harmes-github-oauth', 'harmes-github-app'].includes(event.data?.source)) return;
      githubPopupRef.current = null;
      setIntegrationSetup(null);
      openIntegrations(true).then(() => setIntegrationsMessage(event.data.ok ? `GitHub terhubung${event.data.account ? ` sebagai ${event.data.account}` : ''}.` : (event.data.error || 'GitHub gagal terhubung.')));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  async function saveSettings(event) {
    event.preventDefault(); setSettingsBusy(true); setSettingsMessage('');
    try { const saved = await api('/api/settings', json(settingsForm, 'PUT')); setSettingsForm({ ...saved, apiKey: '' }); await refresh(); const [result, router] = await Promise.all([testConnection(), testRouterStatus()]); setSettingsMessage(`Pengaturan tersimpan. ${result.message}${router?.ok ? ` 9Router aktif (${router.latencyMs} ms).` : ''}`); }
    catch (e) { setSettingsMessage(e.message); } finally { setSettingsBusy(false); }
  }
  async function testSaved() { setSettingsBusy(true); setSettingsMessage('Menguji pengaturan yang sudah tersimpan…'); const [result, router] = await Promise.all([testConnection(), testRouterStatus()]); setSettingsMessage(`${result.message}${router?.ok ? ` 9Router aktif (${router.latencyMs} ms).` : ''}`); setSettingsBusy(false); }
  function downloadTask() {
    const text = `# ${task.title}\n\n${task.description || ''}\n\n${task.result || ''}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `harmes-${task.id.slice(0, 8)}.md`; a.click(); URL.revokeObjectURL(url);
  }
  const routerSettingsPanel = settingsForm?.provider === '9router' && <section className="router-monitor-settings"><div className="panel-heading"><div><h3>Monitoring 9Router</h3><p>Periksa gateway lokal dan tampilkan statusnya di dashboard.</p></div><Wifi size={17} className="muted-icon" /></div><label><input type="checkbox" checked={settingsForm.routerMonitoring?.enabled !== false} onChange={(e) => setSettingsForm({ ...settingsForm, routerMonitoring: { ...(settingsForm.routerMonitoring || {}), enabled: e.target.checked } })} /> Aktifkan pemeriksaan berkala</label><label>Endpoint monitoring<input required value={settingsForm.routerMonitoring?.baseUrl || settingsForm.baseUrl || 'http://127.0.0.1:20128/v1'} onChange={(e) => setSettingsForm({ ...settingsForm, routerMonitoring: { ...(settingsForm.routerMonitoring || {}), baseUrl: e.target.value } })} /></label><label>Dashboard 9Router<input required type="url" value={settingsForm.routerMonitoring?.dashboardUrl || 'http://localhost:20128/dashboard'} onChange={(e) => setSettingsForm({ ...settingsForm, routerMonitoring: { ...(settingsForm.routerMonitoring || {}), dashboardUrl: e.target.value } })} /></label><label>Interval pemeriksaan<select value={settingsForm.routerMonitoring?.intervalSeconds || 30} onChange={(e) => setSettingsForm({ ...settingsForm, routerMonitoring: { ...(settingsForm.routerMonitoring || {}), intervalSeconds: Number(e.target.value) } })}><option value="10">Setiap 10 detik</option><option value="30">Setiap 30 detik</option><option value="60">Setiap 1 menit</option><option value="300">Setiap 5 menit</option></select></label></section>;
  const agentCards = <>{rosterControls}<div className="roster-groups">{rosterGroups.length ? rosterGroups.map((group) => <section className="roster-group" key={group.id}><div className="roster-heading"><h3>{group.name} <span>{group.members.length}</span></h3>{group.id && <button className="text-button" onClick={() => { setError(''); setTaskForm({ title: '', description: '', agentId: 'department:' + group.id }); }}>Tugas departemen <Plus size={13} /></button>}</div><div className="agent-grid">{group.members.map((item) => <button key={item.id} className={'agent-card ' + (selectedAgent === item.id ? 'selected' : '')} onClick={() => openChat(item.id)}><Avatar agent={item} /><div className="agent-info"><strong>{item.name}</strong><span>{item.role}</span><small>{item.description}</small><em className={'identity-badge ' + (item.virtual ? 'virtual' : '')}>{item.virtual ? 'AI tambahan' : 'Identitas website · AI'}</em></div><ChevronRight className="agent-arrow" size={17} /></button>)}</div></section>) : <p className="roster-empty">Anggota tidak ditemukan. Coba kata kunci atau departemen lain.</p>}</div></>;
  const taskList = (items) => <div className="task-list">{items.length ? items.map((item) => <button className="task-row" key={item.id} onClick={() => setTaskId(item.id)}><span className={`task-status ${item.status}`}>{item.status === 'completed' ? <CheckCircle2 size={18} /> : item.status === 'running' ? <LoaderCircle size={17} className="spin" /> : item.status === 'failed' ? <AlertCircle size={17} /> : <Clock3 size={17} />}</span><div className="task-copy"><strong>{item.title}</strong><span>{assignmentName(item.agentId)} · {labels[item.status]}{item.scheduledAt && item.status === 'queued' ? ' · ' + date(item.scheduledAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB' : ''}</span></div><ChevronRight size={16} className="muted-icon" /></button>) : <div className="empty-state"><ListTodo size={27} /><strong>{filter === 'all' ? 'Ruang untuk pekerjaan berikutnya' : 'Tidak ada tugas dalam kategori ini'}</strong><p>Buat tugas, jelaskan hasil yang Anda inginkan.</p><button className="text-button" onClick={newTask}>Buat tugas pertama <Plus size={14} /></button></div>}</div>;
  const chatPanel = <section className="panel chat-panel"><div className="chat-header"><div><h2>Ruang diskusi</h2><p>Dengan {agent?.name || 'tim AI'} · {agent?.role}</p></div><div><button className="text-button" onClick={() => { setCodingAgentId(agent?.id || 'developer'); setOfficeChat(false); navigate('coding'); }}><Code2 size={14} /> Coding</button>{Boolean(messages.length) && <button className="text-button" onClick={clearChat} disabled={Boolean(sending)}>Hapus chat</button>}<Avatar agent={agent} /></div></div><div className="chat-messages" role="log" aria-label="Riwayat percakapan" aria-live="polite" aria-relevant="additions" aria-busy={sending === agent?.id}>{!messages.length && sending !== agent?.id ? <div className="empty-chat"><div className="chat-orbit"><Bot size={29} /></div><strong>Mulai dari satu perintah.</strong><p>Kirim perintah atau ide. Perintah lintas sistem langsung dibahas bersama tim, lalu dikembalikan sebagai jawaban dan langkah berikutnya.</p><div className="suggestions"><button onClick={() => { setDraft(examples[agent?.id] || 'Bantu susun prioritas pekerjaan.'); inputRef.current?.focus(); }}>{examples[agent?.id] || `Bantu susun prioritas pekerjaan ${agent?.role || 'tim'}.`}<ChevronRight size={14} /></button></div></div> : messages.map((item) => <div className={`message ${item.role === 'user' ? 'user' : 'assistant'}`} key={item.id}><div className="message-avatar">{item.role === 'user' ? 'HA' : agent?.initials}</div><div className="message-content"><div className="message-bubble"><Markdown>{item.content}</Markdown></div><small>{date(item.createdAt, { hour: '2-digit', minute: '2-digit' })}</small></div></div>)}{sending === agent?.id && <div className="thinking" role="status"><LoaderCircle size={15} className="spin" /> {chatMode === 'team' ? 'Tim sedang berdiskusi…' : 'Agen sedang menyiapkan jawaban…'}</div>}<div ref={chatEnd} /></div><form className="chat-input-wrap" onSubmit={send}><input ref={inputRef} className="chat-input" aria-label="Pesan untuk agen" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={8000} placeholder={`Pesan untuk ${agent?.role || 'tim AI'}…`} disabled={!server || Boolean(sending)} /><button aria-label="Kirim pesan" className="send-button" type="submit" disabled={!draft.trim() || Boolean(sending) || !server}><Send size={16} /></button></form><p className="chat-note"><ShieldCheck size={12} /> Tinjau hasil sebelum dipakai untuk bisnis.</p></section>;
  const dashboardPanel = <div className="dashboard-view">
    <section className="dashboard-hero">
      <div className="hero-copy"><p className="hero-kicker"><span /> RUANG KERJA TERPADU</p><h2>Satu ruang. Seluruh potensi tim.</h2><p>Kelola pekerjaan, diskusikan ide, hubungkan alat kerja Anda.</p><div className="hero-actions"><button className="primary-button" onClick={newTask} disabled={!server}><Plus size={16} /> Buat tugas baru</button><button className="text-button" onClick={() => openChat('director')}>Diskusi dengan Arya <ArrowUpRight size={16} /></button></div></div>
      <div className="hero-status"><Layers3 size={24} /><strong>{departments.length} divisi, {agents.length} spesialis.</strong><span>Siap berkolaborasi untuk bisnis Anda</span><div className="member-initials">{agents.slice(0, 4).map((member) => <Avatar key={member.id} agent={member} />)}<span>+{Math.max(0, agents.length - 4)}</span></div></div>
    </section>
    <section className="stats dashboard-stats" aria-label="Ringkasan ruang kerja">{[
      { label: 'Tugas aktif', value: pending.length, detail: pending.some((item) => item.status === 'running') ? 'Sedang diproses oleh tim' : 'Antrean kerja tersedia', Icon: ListTodo },
      { label: 'Tugas selesai', value: completed.length, detail: 'Hasil siap ditinjau', Icon: CheckCircle2 },
      { label: 'Spesialis AI', value: agents.length, detail: `${departments.length} divisi keahlian`, Icon: Users },
      { label: 'Akun terhubung', value: connectedIntegrations.length, detail: 'Telegram, GitHub, dan website', Icon: Share2 },
    ].map(({ label, value, detail, Icon }, index) => <article className="stat-card" key={label}><div className="metric-meta"><span>{label}</span><Icon size={17} /></div><strong>{String(value).padStart(2, '0')}</strong><small>{detail}</small><span className="metric-index">0{index + 1}</span></article>)}</section>
    <div className="dashboard-columns">
      <div className="overview-main">
        <section className="panel task-table"><div className="panel-heading"><div><p className="section-eyebrow">PEKERJAAN</p><h2>Tugas terbaru</h2></div><button className="text-button" onClick={() => navigate('tasks')}>Semua tugas <ArrowUpRight size={15} /></button></div><div className="task-table-header"><span>Nama tugas</span><span>Penanggung jawab</span><span>Status</span></div>{state.tasks.length ? state.tasks.slice(0, 4).map((item) => <button key={item.id} className="task-table-row" onClick={() => setTaskId(item.id)}><span className="task-table-name"><FileText size={16} /><span><strong>{item.title}</strong><small>{date(item.createdAt, { day: 'numeric', month: 'short' })} · {item.steps?.length || 0} langkah kerja</small></span></span><span className="task-table-assignee">{assignmentName(item.agentId)}</span><span className={`status-pill ${item.status}`}>{labels[item.status]}</span></button>) : <div className="task-table-empty"><ListTodo size={26} /><div><strong>Pekerjaan berikutnya dimulai di sini.</strong><p>Delegasikan tugas ke satu agen atau seluruh tim.</p></div><button className="secondary-button" onClick={newTask}><Plus size={14} /> Buat tugas</button></div>}</section>
        <section className="panel team-overview"><div className="panel-heading"><div><p className="section-eyebrow">TIM ANDA</p><h2>Keahlian yang saling melengkapi</h2></div><button className="text-button" onClick={() => { setDepartmentFilter('all'); navigate('team'); }}>Lihat tim <ArrowUpRight size={15} /></button></div><div className="team-overview-grid">{departments.slice(0, 4).map((department, index) => { const members = agents.filter((item) => item.departmentId === department.id); const Icon = [Layers3, FileText, Sparkles, BarChart3][index]; return <button className="team-overview-card" key={department.id} onClick={() => { setDepartmentFilter(department.id); navigate('team'); }}><div className={`department-icon department-${index}`}><Icon size={18} /></div><strong>{department.name}</strong><small>{members.length} spesialis</small><div className="team-overview-count">{members.slice(0, 3).map((member) => <Avatar key={member.id} agent={member} />)}<ChevronRight size={14} /></div></button>; })}</div></section>
      </div>
      <div className="overview-side">
        <section className="panel integration-overview"><div className="panel-heading"><div><p className="section-eyebrow">TERHUBUNG LEBIH JAUH</p><h2>Integrasi alat kerja</h2></div><Share2 size={18} className="muted-icon" /></div>{integrationProviders.slice(0, 3).map(({ id, name, detail, icon: Icon }) => { const item = integrationCatalog.connectors.find((connector) => connector.type === id && connector.connected); return <button className={`integration-mini ${id}`} key={id} onClick={() => openProvider(id)}><span className="integration-mini-icon"><Icon size={18} /></span><span className="integration-mini-copy"><strong>{name}</strong><small>{item?.account || detail}</small></span><span className={`integration-mini-state ${item ? 'connected' : ''}`}>{item ? 'Terhubung' : 'Hubungkan'}</span><ChevronRight size={13} /></button>; })}<button className="text-button" onClick={() => openIntegrations()}>Kelola semua integrasi <ArrowUpRight size={14} /></button></section>
        <section className="panel router-overview"><div className="panel-heading"><div><p className="section-eyebrow">GATEWAY MODEL</p><h2>9Router</h2></div><Code2 size={18} className="muted-icon" /></div><div className="router-overview-status"><span className={`router-status-dot ${routerStatus?.ok ? 'connected' : ''}`} /><div><strong>{routerStatus?.ok ? 'Terhubung' : 'Belum terhubung'}</strong><small>{isRouter ? (state.settings.model || 'Model belum dipilih') : 'Monitoring gateway aktif'}</small></div></div><p className="form-note">Gateway lokal: <code>{routerMonitoring.baseUrl || state.settings.baseUrl || 'http://127.0.0.1:20128/v1'}</code></p>{routerStatus && <p className="form-note router-monitor-detail">{routerStatus.ok ? `${routerStatus.modelCount || routerStatus.models?.length || 0} model · ${routerStatus.latencyMs ?? '—'} ms · cek ${routerStatus.checkedAt ? date(routerStatus.checkedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'} WIB` : routerStatus.message}</p>}<div className="router-overview-actions"><button className="secondary-button" onClick={openRouterSettings}><Settings size={14} /> Atur 9Router</button><a className="text-button" href={routerDashboardUrl} target="_blank" rel="noopener noreferrer">Buka dashboard <ArrowUpRight size={14} /></a></div></section>
        <section className="panel dashboard-activity"><div className="panel-heading"><div><p className="section-eyebrow">JEJAK KERJA</p><h2>Aktivitas terbaru</h2></div><Activity size={17} className="muted-icon" /></div>{state.activity.length ? state.activity.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><span className={`activity-dot ${item.type}`} /><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{date(item.createdAt, { hour: '2-digit', minute: '2-digit' })}</time></div>) : <p className="empty-activity">Aktivitas tugas dan diskusi akan tercatat di sini.</p>}</section>
      </div>
    </div>
    <div className="dashboard-bottom"><section className="panel"><div className="panel-heading"><div><p className="section-eyebrow">MULAI PERCAKAPAN</p><h2>Pilih rekan diskusi Anda</h2></div><MessageSquare size={18} className="muted-icon" /></div><div className="agent-grid">{agents.slice(0, 4).map((item) => <button key={item.id} className={`agent-card ${item.id === agent?.id ? 'selected' : ''}`} onClick={() => openChat(item.id)}><Avatar agent={item} /><div className="agent-info"><strong>{item.name}</strong><span>{item.role}</span></div><ChevronRight size={15} className="agent-arrow" /></button>)}</div></section><div className="dashboard-chat">{chatPanel}</div></div>
  </div>;
  return <div className={view === 'office' ? 'app-shell office-host' : 'app-shell'}>
    {view !== 'office' && <a className="skip-link" href="#main-content">Lewati navigasi</a>}
    {view === 'office' && <OfficeView onAction={officeAction} agents={agents} departments={departments} mode={officeMode} />}
    {view !== 'office' && <>{menu && <button className="menu-overlay" aria-label="Tutup menu" onClick={() => setMenu(false)} />}
    <aside ref={sidebarRef} id="workspace-navigation" className={`sidebar ${menu ? 'is-open' : ''}`}>
      <div className="brand"><div className="brand-mark logo-mark"><img src="/softklinik-logo.png" alt="" /></div><div className="brand-wordmark"><strong>Softklinik<span>.</span></strong><span>HARMES WORKSPACE</span></div></div>
      <button className="workspace-switcher" onClick={openSettings}><span className="brand-monogram">H</span><span><strong>Harmes Office</strong><small>Ruang kerja pribadi</small></span><ChevronDown size={14} /></button>
      <div className="workspace-label">RUANG KERJA</div><nav aria-label="Navigasi utama">{[['dashboard', LayoutDashboard, 'Dashboard'], ['projects', Activity, 'Operasional'], ['tasks', ListTodo, 'Tugas'], ['team', Users, 'Tim AI'], ['insights', BarChart3, 'Insight'], ['knowledge', BookOpen, 'Basis pengetahuan'], ['coding', Code2, 'Studio Coding']].map(([id, Icon, name]) => <button key={id} aria-current={view === id ? 'page' : undefined} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => { navigate(id); if (id === 'knowledge') loadDocuments(); }}><Icon size={18} />{name}{id === 'tasks' && <em>{pending.length}</em>}</button>)}<button className="nav-item office-back" onClick={() => navigate('office')}><Layers3 size={18} /> Kantor animasi <ArrowUpRight size={13} /></button></nav>
      <div className="nav-section-label">KONEKSI</div><nav aria-label="Koneksi akun"><button className="nav-item telegram-nav" onClick={() => openProvider('telegram')}><Send size={18} /> Telegram <span className={`nav-connection-dot ${connectedIntegrations.some((item) => item.type === 'telegram') ? 'connected' : ''}`} /></button><button className="nav-item" onClick={() => openIntegrations()}><Share2 size={18} /> Integrasi akun</button></nav>
      <div className="sidebar-bottom"><button className="connection connection-card" onClick={openSettings}><span className={`dot ${connection?.ok ? 'online' : ''}`} /><div><strong>{!server ? 'Server belum terhubung' : connection?.ok ? (isLocal ? 'AI lokal terhubung' : isRouter ? '9Router terhubung' : 'API terhubung') : 'AI perlu dihubungkan'}</strong><small>{state.settings.model || 'Ollama · model lokal'}</small></div><ChevronRight size={14} /></button><div className="sidebar-utilities"><button className="nav-item" onClick={openSettings}><Settings size={17} /> Pengaturan</button><button className="icon-button" title="Ekspor cadangan" aria-label="Ekspor cadangan" onClick={downloadWorkspace}><Download size={17} /></button><button className="icon-button" title="Panduan singkat" aria-label="Panduan singkat" onClick={() => setHelp(true)}><BookOpen size={17} /></button></div><div className="profile"><div className="profile-avatar">HA</div><div><strong>Harmes</strong><small>Pemilik ruang kerja</small></div><ShieldCheck size={17} /></div></div>
    </aside>
    <main id="main-content" tabIndex={-1} className="main-content"><header className="topbar"><button ref={menuButtonRef} className="mobile-menu" aria-label={menu ? 'Tutup menu' : 'Buka menu'} aria-expanded={menu} aria-controls="workspace-navigation" onClick={() => setMenu(!menu)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{{ projects: 'Operasional', dashboard: 'Dashboard', tasks: 'Tugas', insights: 'Insight', team: 'Tim AI', knowledge: 'Basis pengetahuan', coding: 'Studio Coding' }[view]}</strong></div><div className="top-actions"><span className="privacy-badge"><ShieldCheck size={12} /> {view === 'coding' ? 'Kode di laptop · gateway 9Router' : isLocal ? 'Pemrosesan lokal' : isRouter ? '9Router lokal' : 'API online'}</span><span className="topbar-divider" /><button className="icon-button" aria-label="Buka pengaturan" onClick={openSettings}><Settings size={17} /></button><div className="topbar-avatar">HA</div></div></header>
    <div className="page-body"><section className="welcome workspace-heading"><div><p className="eyebrow">SOFTKLINIK HARMES / {view === 'dashboard' ? 'OVERVIEW' : 'WORKSPACE'}</p><h1>{view === 'projects' ? 'Kantor operasional' : view === 'knowledge' ? 'Basis pengetahuan' : view === 'tasks' ? 'Pekerjaan tim' : view === 'insights' ? 'Insight ruang kerja' : view === 'team' ? 'Kenali tim AI Anda' : view === 'coding' ? 'Studio Coding' : 'Selamat datang, Harmes.'}</h1><p className="subheading">{view === 'knowledge' ? 'Referensi bisnis yang mendukung setiap jawaban AI.' : view === 'tasks' ? 'Kelola prioritas, pantau proses, tinjau hasil kerja.' : view === 'insights' ? 'Pantau produktivitas dan distribusi pekerjaan tim.' : view === 'team' ? `${agents.length} spesialis dalam ${departments.length} divisi, siap membantu Anda.` : view === 'coding' ? 'VSCode, Codex CLI, dan 9Router untuk pekerjaan kode lokal.' : 'Ruang untuk fokus. Tim untuk mewujudkannya.'}</p></div>{view === 'dashboard' ? <div className="header-actions"><CalendarDays size={16} /><span>{date(Date.now(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><button className="primary-button" onClick={newTask} disabled={!server}><Plus size={16} /> Buat tugas</button></div> : <button className="primary-button" onClick={newTask} disabled={!server}><Plus size={17} /> Buat tugas</button>}</section>
    {error && <div role="alert" className="alert"><AlertCircle size={18} /><span>{error}</span><button aria-label="Tutup pesan" onClick={() => setError('')}><X size={16} /></button></div>}
    {!server && loaded && <div className="alert"><AlertCircle size={18} /><span>Server belum aktif. Jalankan Mulai Kantor AI.cmd di folder aplikasi.</span><button className="text-button" onClick={refresh}>Coba lagi</button></div>}
    {view !== 'coding' && server && connection && !connection.ok && <div className="setup-banner"><div className="setup-icon"><Bot size={23} /></div><div><strong>Hubungkan mesin AI {isLocal ? 'lokal' : 'online'}</strong><p>{connection.message}</p></div><button className="secondary-button" onClick={openSettings}>Atur koneksi <ChevronRight size={15} /></button></div>}
    {!loaded ? <div className="loading" role="status"><LoaderCircle className="spin" /> Memuat ruang kerja…</div> : <>
    {!['team', 'dashboard', 'coding', 'projects'].includes(view) && <section className="stats"><div className="stat-card"><div className="stat-icon purple"><ListTodo size={19} /></div><div><span>Tugas aktif</span><strong>{pending.length}</strong><small>{pending.some((t) => t.status === 'running') ? 'Tim sedang bekerja' : 'Menunggu pekerjaan baru'}</small></div></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2 size={19} /></div><div><span>Tugas selesai</span><strong>{completed.length}</strong><small>Hasil dapat dibuka kembali</small></div></div><div className="stat-card"><div className="stat-icon orange"><Bot size={19} /></div><div><span>Rekan kerja AI</span><strong>{agents.length}</strong><small>Satu model, beragam keahlian</small></div></div></section>}
    {view === 'projects' ? <OperationsWorkspace api={api} /> : view === 'coding' ? <CodingWorkspace api={api} agents={agents} initialAgentId={codingAgentId} /> : view === 'knowledge' ? <div className="content-grid knowledge-grid"><section className="panel"><div className="panel-heading"><div><h2>Tambah referensi</h2><p>Teks produk, FAQ, SOP, atau catatan bisnis. Maksimal 20 dokumen.</p></div><BookOpen size={19} /></div><p className="form-note">Bagian dokumen yang relevan disertakan dalam chat dan tugas. {isLocal ? 'Pemrosesan AI tetap lokal.' : 'Referensi yang relevan ikut dikirim ke penyedia AI pilihan Anda.'} Periksa isi sebelum menyimpan.</p><form className="web-ingestion-form" onSubmit={ingestDocument}><label>Ambil dari URL HTTPS<input type="url" required value={ingestUrl} onChange={(e) => setIngestUrl(e.target.value)} placeholder="https://contoh.com/sop" /></label><label>Tag (pisahkan koma)<input value={ingestTags} onChange={(e) => setIngestTags(e.target.value)} placeholder="sop, produk" /></label><p className="form-note">Satu URL per kiriman. Robots.txt dihormati. Pemeriksaan menilai kualitas tangkapan, bukan kebenaran fakta.</p><button className="secondary-button" disabled={documentsBusy}>Ambil referensi</button></form><label className="secondary-button document-upload"><Upload size={16} /> Pilih berkas teks<input type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={uploadDocument} className="sr-only" aria-label="Pilih berkas teks" /></label><form className="document-form" onSubmit={saveDocument}><label>Nama dokumen<input required maxLength={120} value={documentForm.name} onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })} placeholder="Contoh: FAQ Softklinik" /></label><label>Isi dokumen<textarea required rows={12} maxLength={100000} value={documentForm.content} onChange={(e) => setDocumentForm({ ...documentForm, content: e.target.value })} placeholder="Tempel referensi bisnis di sini…" /></label><p className="form-note">{documentForm.content.length.toLocaleString('id-ID')} / 100.000 karakter</p><button className="primary-button" disabled={documentsBusy || documents.length >= 20}>{documentsBusy && <LoaderCircle className="spin" size={15} />} Simpan referensi</button></form></section><section className="panel"><div className="panel-heading"><div><h2>Referensi tersimpan</h2><p>{documents.length} dokumen tersedia untuk AI.</p></div><button className="text-button" onClick={loadDocuments}>Muat ulang</button></div>{documents.length ? documents.map((document) => <article className="document-row" key={document.id}><FileText size={20} /><div><strong>{document.name}</strong>{document.source?.uri && (() => { const sourceUrl = markdownUrl(document.source.uri); return sourceUrl ? <small><a href={sourceUrl} target="_blank" rel="noreferrer">Sumber: {document.source.uri}</a></small> : null; })()}{document.source?.fetchedAt && <small>Diambil: {date(document.source.fetchedAt)}</small>}{document.source?.sha256 && <small style={{ overflowWrap: "anywhere" }}>SHA-256: {document.source.sha256}</small>}{document.source?.quality && <small>Pemeriksaan tangkapan: {document.source.quality.passed}/{document.source.quality.applicable || document.source.quality.total}. Bukan penilaian kebenaran fakta.</small>}<small>{document.updatedAt ? date(document.updatedAt, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tersimpan'}{Number.isFinite(document.characters) ? ' · ' + document.characters.toLocaleString('id-ID') + ' karakter' : ''}</small></div><button type="button" className="icon-button" aria-label={'Hapus ' + document.name} onClick={() => deleteDocument(document.id)}><Trash2 size={17} /></button></article>) : <div className="empty-state"><BookOpen size={28} /><strong>Belum ada referensi</strong><p>Tambahkan FAQ atau SOP pertama Anda.</p></div>}</section></div> : view === 'tasks' ? <section className="panel"><div className="panel-heading"><div><h2>Daftar tugas</h2><p>Hasil AI berupa saran dan draf yang dapat Anda tinjau.</p></div><span className="count-badge">{state.tasks.length} tugas</span></div><div className="filters">{[['all', 'Semua'], ['active', 'Aktif'], ['completed', 'Selesai'], ['failed', 'Gagal'], ['cancelled', 'Dibatalkan']].map(([key, text]) => <button key={key} aria-pressed={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{text}</button>)}</div>{taskList(tasks)}</section> : view === 'insights' ? <section className="insights-page"><section className="panel insight-hero"><div><p className="eyebrow">MISSION CONTROL · DATA LOKAL</p><h2>Insight kerja AI</h2><p>Ringkasan aktivitas ruang kerja untuk membantu karyawan memilih pekerjaan berikutnya. Angka berasal dari tugas dan percakapan yang tersimpan di laptop.</p></div><div className="insight-rate"><strong>{completionRate}%</strong><span>rasio selesai</span></div></section><div className="insight-grid"><section className="panel"><div className="panel-heading"><div><h2>Status ruang kerja</h2><p>Jejak penggunaan yang dapat ditindaklanjuti.</p></div><Activity size={17} className="muted-icon" /></div><div className="insight-metrics"><div><strong>{userMessages.length}</strong><span>Percakapan karyawan</span></div><div><strong>{state.tasks.length}</strong><span>Total tugas AI</span></div><div><strong>{state.activity.length}</strong><span>Aktivitas tersimpan</span></div><div><strong>{state.tasks.filter((item) => item.status === 'failed').length}</strong><span>Perlu ditinjau</span></div></div></section><section className="panel"><div className="panel-heading"><div><h2>Fitur siap dipakai</h2><p>Pilih alur kerja sesuai kebutuhan.</p></div><Sparkles size={17} className="muted-icon" /></div><div className="insight-actions"><button onClick={() => openChat('director')}><MessageSquare size={15} /><span><strong>Diskusi 1:1</strong><small>Rumuskan ide bersama agen yang tepat.</small></span><ChevronRight size={15} /></button><button onClick={newTask}><ListTodo size={15} /><span><strong>Delegasi tugas</strong><small>Serahkan ke agen, departemen, atau tim inti.</small></span><ChevronRight size={15} /></button><button onClick={() => navigate('tasks')}><CheckCircle2 size={15} /><span><strong>Tinjau hasil</strong><small>Buka langkah kerja, status, dan unduh Markdown.</small></span><ChevronRight size={15} /></button></div></section></div><section className="panel"><div className="panel-heading"><div><h2>Beban per departemen</h2><p>Tugas langsung dan kontribusi Tim inti. Satu tugas dapat dihitung di beberapa departemen.</p></div><Users size={17} className="muted-icon" /></div><div className="department-insights">{departmentInsights.map((item) => <button key={item.id} onClick={() => { setDepartmentFilter(item.id); navigate('team'); }}><span className="department-insight-name"><strong>{item.name}</strong><small>{item.members} agen</small></span><span className="department-insight-bar"><i style={{ width: `${state.tasks.length ? Math.min(100, (item.tasks / state.tasks.length) * 100) : 0}%` }} /></span><span className="department-insight-count">{item.tasks} tugas · {item.completed} selesai</span></button>)}</div></section><PerformancePanel performance={performance}/></section> : view === 'team' ? <><section className="panel team-panel"><div className="panel-heading"><div><h2>Tim Softklinik Harmes</h2><p>Pilih agen untuk mulai berdiskusi.</p></div><Users size={19} className="muted-icon" /></div>{agentCards}</section><div className="workflow"><Sparkles size={20} /><div><h3>Kolaborasi tim inti</h3><p>Arya menyusun rencana. Sigit, Fajri, dan Dhensa memberi masukan. Arya merangkum hasil. Seluruh {agents.length} agen juga dapat menerima tugas individual atau berkolaborasi dalam departemen.</p><button className="text-button" onClick={newTask}>Delegasikan ke tim <ChevronRight size={15} /></button></div></div></> : dashboardPanel}
    </>}
    <footer className="page-footer">SOFTKLINIK HARMES <span>Ruang untuk berpikir. Tim untuk bergerak.</span></footer></div></main></>}
    {view === 'office' && error && !officeChat && !taskForm && <div role="alert" className="alert office-alert"><AlertCircle size={18} /><span>{error}</span><button aria-label="Tutup pesan" onClick={() => setError('')}><X size={16} /></button></div>}
    {view === 'office' && officeChat && <section ref={drawerRef} className="office-drawer" role="dialog" aria-label="Diskusi dengan agen"><header><div><h2>Diskusi tim Harmes</h2><p>Pilih rekan kerja untuk berdiskusi.</p></div><button className="close-drawer" aria-label="Tutup diskusi" onClick={() => setOfficeChat(false)}><X size={18} /></button></header>{rosterControls}<div ref={drawerRosterRef} className="drawer-roster" aria-label="Pilih anggota tim">{rosterGroups.map((group) => <div key={group.id}><h3>{group.name}</h3><div className="drawer-tabs">{group.members.map((item) => <button key={item.id} className={item.id === agent?.id ? 'active' : ''} title={item.name + ' · ' + item.role} aria-pressed={item.id === agent?.id} onClick={() => setSelectedAgent(item.id)}>{item.shortName || item.name}<small>{item.virtual ? 'AI tambahan' : 'Identitas website · AI'}</small></button>)}</div></div>)}{!visibleAgents.length && <p className="roster-empty">Anggota tidak ditemukan.</p>}</div>{error && <div role="alert" className="alert"><AlertCircle size={16} /><span>{error}</span></div>}{chatPanel}</section>}
    {taskForm && <Modal title="Delegasikan pekerjaan" subtitle="TUGAS BARU" close={() => !taskBusy && setTaskForm(null)}><form onSubmit={createTask}><label>Judul tugas<input autoFocus required maxLength={200} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Contoh: Rencana promosi Softklinik bulan ini" /></label><label>Detail dan hasil yang diinginkan<textarea rows={4} maxLength={12000} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Jelaskan tujuan, audiens, dan format hasil…" /></label><label>Serahkan kepada<select value={taskForm.agentId} onChange={(e) => setTaskForm({ ...taskForm, agentId: e.target.value })}><option value="team">Tim inti · 5 langkah kolaborasi</option><optgroup label="Kolaborasi departemen">{departments.map((item) => <option key={item.id} value={'department:' + item.id}>{item.name} · maksimal 5 langkah</option>)}</optgroup>{allGroups.map((group) => <optgroup key={group.id} label={group.name}>{agents.filter((item) => (item.departmentId || '') === group.id).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}{item.virtual ? ' · AI tambahan' : ' · Identitas website'}</option>)}</optgroup>)}</select></label><label>Jadwalkan (opsional)<input type="datetime-local" value={taskForm.scheduledAt || ''} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setTaskForm({ ...taskForm, scheduledAt: e.target.value })} /></label><p className="form-note">Jadwal mengikuti zona waktu perangkat. Aplikasi harus tetap berjalan untuk memulai tugas tepat waktu.</p><p className="form-note">Tugas diproses berurutan agar laptop tetap responsif. Kolaborasi tim memerlukan waktu lebih lama.</p>{error && <p className="inline-error">{error}</p>}<button className="primary-button wide" type="submit" disabled={taskBusy || !taskForm.title.trim()}>{taskBusy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Mulai kerjakan</button></form></Modal>}
    {task && <Modal title={task.title} subtitle="RUANG KERJA TUGAS" close={() => setTaskId(null)} wide><div className="result-meta"><span className={`status-pill ${task.status}`}>{labels[task.status]}</span><span>{date(task.createdAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>{task.result && <button className="text-button" onClick={downloadTask}><Download size={15} /> Unduh hasil</button>}</div>{task.description && <p className="task-description">{task.description}</p>}{task.error && <div className="alert"><AlertCircle size={17} /><span>{task.error}</span></div>}{task.result && <div className="result-copy"><Markdown>{task.result}</Markdown></div>}{task.status === 'queued' && <p className="form-note">Tugas menunggu giliran. Anda dapat menutup panel ini dan kembali nanti.</p>}{error && <p role="alert" className="inline-error">{error}</p>}<div className="modal-actions">{['queued', 'running'].includes(task.status) && <button className="secondary-button" disabled={taskActionBusy} onClick={() => changeTask('cancel')}>{taskActionBusy ? 'Memproses…' : 'Batalkan tugas'}</button>}{['failed', 'cancelled'].includes(task.status) && <button className="primary-button" disabled={taskActionBusy} onClick={() => changeTask('retry')}>{taskActionBusy ? 'Memproses…' : 'Coba lagi'}</button>}{['completed', 'failed', 'cancelled'].includes(task.status) && <button className="secondary-button" disabled={taskActionBusy} onClick={() => changeTask('delete')}>Hapus tugas</button>}</div><div className="steps">{task.steps?.map((step, index) => <details key={index} className="step"><summary><span className={`step-dot ${step.status}`} />{step.label}<small>{labels[step.status]}</small></summary><div><Markdown>{step.content || 'Hasil akan muncul setelah langkah ini dikerjakan.'}</Markdown></div></details>)}</div></Modal>}
    {settingsForm && <Modal title="Pengaturan ruang kerja" subtitle="MESIN AI & KONTEKS BISNIS" close={() => setSettingsForm(null)}><form onSubmit={saveSettings}><label>Nama bisnis<input required value={settingsForm.businessName || ''} onChange={(e) => setSettingsForm({ ...settingsForm, businessName: e.target.value })} maxLength={500} /></label><label>Penyedia AI<select value={settingsForm.provider || 'ollama'} onChange={(e) => setSettingsForm({ ...settingsForm, provider: e.target.value, baseUrl: e.target.value === 'ollama' ? 'http://127.0.0.1:11434' : e.target.value === '9router' ? 'http://127.0.0.1:20128/v1' : 'https://api.openai.com/v1', model: e.target.value === 'ollama' ? 'qwen2.5:3b' : '' })}><option value="ollama">Ollama · lokal di laptop</option><option value="9router">9Router di laptop</option><option value="openai-compatible">API kompatibel OpenAI · online</option></select></label><label>Alamat layanan<input required value={settingsForm.baseUrl || ''} onChange={(e) => setSettingsForm({ ...settingsForm, baseUrl: e.target.value })} /></label>{routerSettingsPanel}<label>Model<input required value={settingsForm.model || ''} onChange={(e) => setSettingsForm({ ...settingsForm, model: e.target.value })} placeholder={settingsForm.provider === 'ollama' ? 'qwen2.5:3b' : 'ID model dari penyedia Anda'} list="available-models" /><datalist id="available-models">{connection?.models?.map((model) => <option key={model} value={model} />)}</datalist></label>{['openai-compatible', '9router'].includes(settingsForm.provider) && <><label>API key<input type="password" autoComplete="off" value={settingsForm.apiKey || ''} onChange={(e) => setSettingsForm({ ...settingsForm, apiKey: e.target.value })} placeholder={settingsForm.hasApiKey ? 'Kunci tersimpan. Isi untuk mengganti.' : 'Kunci dari penyedia API'} /></label><p className="form-note">Mode API/9Router mengirim instruksi ke penyedia pilihan Anda. Router di laptop dapat memakai model online. Kunci dilindungi di penyimpanan laptop. Mengganti alamat penyedia akan melepas kunci sebelumnya.</p>{settingsForm.hasApiKey && <label><input type="checkbox" checked={Boolean(settingsForm.clearApiKey)} onChange={(e) => setSettingsForm({ ...settingsForm, clearApiKey: e.target.checked })} /> Hapus API key tersimpan</label>}</>}<button type="button" className="secondary-button wide" onClick={downloadWorkspace}><Download size={15} /> Ekspor cadangan ruang kerja</button><label className="secondary-button document-upload"><Upload size={15} /> Pulihkan cadangan<input type="file" accept=".json,application/json" onChange={restoreWorkspace} disabled={settingsBusy} className="sr-only" aria-label="Pulihkan cadangan" /></label><label>Konteks bisnis<textarea rows={3} maxLength={8000} value={settingsForm.context || ''} onChange={(e) => setSettingsForm({ ...settingsForm, context: e.target.value })} placeholder="Produk, pelanggan, gaya komunikasi, dan sasaran tim…" /></label>{settingsForm.provider === 'ollama' && <div className="install-hint"><Bot size={17} /><p>Ollama harus berjalan. Unduh model sekali dengan <code>ollama pull qwen2.5:3b</code>. Setelah itu dapat dipakai tanpa internet.</p></div>}{settingsMessage && <p role="status" className="settings-message">{settingsMessage}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={testSaved} disabled={settingsBusy}><Wifi size={15} /> Tes tersimpan</button><button className="primary-button" type="submit" disabled={settingsBusy}>{settingsBusy && <LoaderCircle size={15} className="spin" />} Simpan & uji</button></div></form></Modal>}
    {integrationSetup && <Modal title={`${integrationSetup.id ? 'Kelola' : 'Hubungkan'} ${integrationSetup.provider === 'github' ? 'GitHub' : integrationSetup.provider === 'telegram' ? 'Telegram' : integrationSetup.provider === 'web' ? 'Website / CMS' : 'media sosial'}`} subtitle="AKSES TERKONTROL" close={() => !settingsBusy && setIntegrationSetup(null)}><form onSubmit={saveIntegration}><p className="form-note">Rahasia disimpan hanya di server lokal. Gunakan token dengan izin minimum. Website/CMS memakai Bearer token; application password Basic belum didukung.</p><label>Nama koneksi<input autoFocus required value={integrationSetup.name} onChange={(e) => setIntegrationSetup({ ...integrationSetup, name: e.target.value })} maxLength={120} /></label>{integrationSetup.provider === 'web' && <label>Alamat website / CMS<input required type="url" placeholder="https://contoh.com" value={integrationSetup.baseUrl || ''} onChange={(e) => setIntegrationSetup({ ...integrationSetup, baseUrl: e.target.value })} /></label>}{integrationSetup.provider === 'github' && <><p className="form-note">Gunakan otorisasi resmi GitHub App dengan repository terpilih. Client secret dan token tetap di server lokal.</p>{integrationSetup.githubApp && <button type="button" className="secondary-button wide" onClick={startGithubOAuth} disabled={settingsBusy}><Github size={15} /> Hubungkan GitHub App</button>}{integrationSetup.oauth && !integrationSetup.githubApp && <button type="button" className="secondary-button wide" onClick={startGithubOAuth} disabled={settingsBusy}><Github size={15} /> Gunakan OAuth browser</button>}{!integrationSetup.githubApp && !integrationSetup.oauth && <p className="form-note">GitHub App belum dikonfigurasi. Aktifkan lewat server atau gunakan GitHub CLI browser sebagai fallback.</p>}</>}{integrationSetup.provider === 'telegram' && <><p className="form-note">Buat bot lewat <strong>@BotFather</strong>, lalu tempel token bot. Token diverifikasi via Telegram sebelum disimpan. Masukkan ID pengguna pemilik.</p><label>ID pengguna Telegram pemilik<input required inputMode="numeric" pattern="[0-9]+" value={integrationSetup.ownerUserId || ''} onChange={(e) => setIntegrationSetup({ ...integrationSetup, ownerUserId: e.target.value })} placeholder="ID pengguna pemilik" /></label><label>ID chat Telegram (opsional)<input inputMode="numeric" value={integrationSetup.telegramChatId || ''} onChange={(e) => setIntegrationSetup({ ...integrationSetup, telegramChatId: e.target.value })} placeholder="ID chat tujuan laporan" /></label></>}{integrationSetup.provider !== 'github' && <label>{integrationSetup.provider === 'telegram' ? 'Token bot Telegram' : 'Token / secret'}<input required={!integrationSetup.id} type="password" autoComplete="off" value={integrationSetup.token} onChange={(e) => setIntegrationSetup({ ...integrationSetup, token: e.target.value })} placeholder={integrationSetup.id ? 'Kosongkan untuk mempertahankan token' : integrationSetup.provider === 'telegram' ? 'Token dari @BotFather' : 'Bearer token penyedia'} /></label>}{integrationsMessage && <p role="status" className="settings-message">{integrationsMessage}</p>}<div className="modal-actions">{integrationSetup.id ? <button type="button" className="secondary-button" onClick={disconnectIntegration} disabled={settingsBusy}>Hapus koneksi</button> : <button type="button" className="secondary-button" onClick={() => setIntegrationSetup(null)} disabled={settingsBusy}>Batal</button>}<button className="primary-button" type="submit" disabled={settingsBusy}>{settingsBusy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />} Simpan konektor</button></div></form>{integrationSetup.id && ['github', 'web'].includes(integrationSetup.provider) && <section className="connector-tools"><h3>Baca data akun</h3>{integrationSetup.provider === 'github' && <><label>Repository opsional<input value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="pemilik/repository" maxLength={200} /></label><button type="button" className="secondary-button" onClick={loadGithubRepositories} disabled={settingsBusy}>Kelola repository terpilih</button>{githubRepos.length > 0 && <div className="github-repository-list">{githubRepos.map((repo) => <label key={repo.fullName}><input type="checkbox" checked={githubSelected.includes(repo.fullName)} onChange={(e) => setGithubSelected((current) => e.target.checked ? [...new Set([...current, repo.fullName])] : current.filter((item) => item !== repo.fullName))} /> {repo.fullName}{repo.private ? ' · privat' : ''}</label>)}<button type="button" className="primary-button" onClick={saveGithubRepositories} disabled={settingsBusy}>Simpan pilihan</button></div>}</>}<button type="button" className="secondary-button" onClick={inspectIntegration} disabled={settingsBusy}>Baca data</button>{integrationResult != null && <pre className="connector-result">{typeof integrationResult === 'string' ? integrationResult : JSON.stringify(integrationResult, null, 2)}</pre>}</section>}{integrationSetup.id && integrationSetup.provider === 'telegram' && <section className="connector-tools"><h3>Kirim pesan Telegram</h3><label>ID chat tujuan<input value={telegramDraft.chatId} onChange={(e) => { setPendingAction(null); setTelegramDraft({ ...telegramDraft, chatId: e.target.value }); }} placeholder="Contoh: 123456789" maxLength={80} /></label><label>Pesan<textarea rows={4} maxLength={4096} value={telegramDraft.text} onChange={(e) => { setPendingAction(null); setTelegramDraft({ ...telegramDraft, text: e.target.value }); }} /></label><button type="button" className="secondary-button" disabled={settingsBusy || !telegramDraft.chatId.trim() || !telegramDraft.text.trim()} onClick={previewTelegram}>Tinjau sebelum kirim</button>{pendingAction && <div className="action-preview"><strong>Konfirmasi pengiriman ke {pendingAction.chatId}</strong><p>{pendingAction.text}</p><small>Berlaku sampai {date(pendingAction.expiresAt, { hour: '2-digit', minute: '2-digit' })} WIB.</small><div className="modal-actions"><button type="button" className="secondary-button" disabled={settingsBusy} onClick={() => setPendingAction(null)}>Batal</button><button type="button" className="primary-button" disabled={settingsBusy} onClick={approveTelegram}>Setujui & kirim pesan</button></div></div>}</section>}</Modal>}
    {integrations && <Modal title="Integrasi akun & web" subtitle="AKSES TERKONTROL" close={() => setIntegrations(null)} wide><p className="form-note">GitHub membaca profil atau repository yang Anda tentukan. Website mendukung pembacaan WordPress. Telegram mengirim pesan setelah Anda meninjau tujuan dan menyetujuinya.</p><div className="integration-grid">{(integrations.providers || [{ id: 'github', name: 'GitHub' }, { id: 'telegram', name: 'Telegram' }, { id: 'social', name: 'Media sosial' }, { id: 'web', name: 'Website / CMS' }]).map((provider) => { const Icon = provider.id === 'github' ? Github : provider.id === 'telegram' ? Send : provider.id === 'web' ? Globe2 : Share2; const detail = provider.detail || (provider.id === 'github' ? 'Profil akun secara aman' : provider.id === 'telegram' ? 'Bot pesan dan notifikasi' : provider.id === 'web' ? 'WordPress, hosting, analytics' : 'Kalender konten dan statistik'); const connectionItem = (integrations.connectors || []).find((item) => item.type === provider.id); return <article className="integration-card" key={provider.id}><div className="integration-icon"><Icon size={20} /></div><div className="integration-copy"><strong>{provider.name}</strong><span>{detail}</span><small>{connectionItem?.connected ? `Terhubung · ${connectionItem.account || 'akun tersimpan'}` : 'Belum terhubung'}</small></div><button className="secondary-button" type="button" onClick={() => connectIntegration({ ...provider, connector: connectionItem })}>{connectionItem ? 'Kelola' : 'Hubungkan'}</button></article>; })}</div>{Boolean(integrations.connectors?.length) && <><h3>Koneksi tersimpan</h3>{integrations.connectors.map((item) => <article className="integration-card" key={item.id}><div className="integration-copy"><strong>{item.name}</strong><span>{item.type} · {item.account || item.baseUrl || 'Konfigurasi tersimpan'}</span></div><button type="button" className="secondary-button" onClick={() => connectIntegration({ ...(integrations.providers || []).find((provider) => provider.id === item.type), id: item.type, connector: item })}>Kelola</button></article>)}</>}<div className="integration-policy"><ShieldCheck size={17} /><div><strong>Persetujuan tetap di tangan Anda</strong><p>Token tidak dikirim ke AI. Setujui setiap tindakan yang mengubah atau memublikasikan sesuatu.</p></div></div>{integrationsMessage && <p role="status" className="settings-message">{integrationsMessage}</p>}</Modal>}
    {help && <Modal title="Mulai bekerja bersama tim AI" subtitle="PANDUAN SINGKAT" close={() => setHelp(false)}><ol className="help-list"><li><strong>Pastikan Ollama terhubung.</strong><p>Buka Pengaturan, pilih model yang sudah diunduh, lalu Simpan & uji.</p></li><li><strong>Diskusi dengan satu agen.</strong><p>Pilih agen di dashboard. Jelaskan konteks dan hasil yang Anda butuhkan.</p></li><li><strong>Delegasikan tugas ke tim.</strong><p>Klik Buat tugas. Pilih Tim inti untuk lima langkah kolaborasi, pilih departemen, atau pilih salah satu dari {agents.length} agen.</p></li><li><strong>Tinjau hasil kerja.</strong><p>Buka tugas untuk membaca setiap langkah atau mengunduh hasil akhir.</p></li></ol><p className="form-note">Agen saat ini menghasilkan saran, draf, dan kode. Pengiriman pesan, perubahan file, serta eksekusi kode dilakukan oleh Anda.</p></Modal>}
  </div>;
}
export default App;
