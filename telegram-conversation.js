const ACTION_START = /^(?:arya[\s,:-]+)?(?:tolong[\s,:-]+)?(?:buat|bikin|buatkan|susun|rancang|kerjakan|jalankan|mulai|bangun|kembangkan|implementasikan|tambahkan|perbaiki|ubah|adakan|bentuk|audit|evaluasi|optimalkan|optimasi|update|uji|setujui|batalkan|hentikan|lanjutkan|tunda|ulang|rollback|deploy|commit|coba\s+lagi)\b/i;
const ACTION_VERB = /\b(?:buatkan|bikin|kerjakan|jalankan|implementasikan|tambahkan|adakan|bentuk|audit|evaluasi|optimalkan|optimasi|update|uji|deploy|commit|setujui|batalkan|hentikan|lanjutkan|tunda|rollback)\b/i;
const EXPLICIT_REQUEST = /\b(?:saya|aku|kami|kita)\s+(?:ingin|mau|perlu|butuh)\s+(?:buat|bikin|membuat|susun|menyusun|rancang|merancang|kerjakan|mengerjakan|jalankan|menjalankan|mulai|bangun|kembangkan|mengembangkan|implementasikan|mengimplementasikan|tambahkan|menambahkan|perbaiki|memperbaiki|ubah|mengubah|adakan|mengadakan|audit|mengaudit|evaluasi|mengevaluasi|optimalkan|mengoptimalkan|optimasi|update|perbarui|memperbarui)|\b(?:tolong|mohon|bantu(?:lah| saya| aku)?)\s+(?:buat|bikin|susun|rancang|kerjakan|jalankan|mulai|bangun|kembangkan|implementasikan|tambahkan|perbaiki|ubah|adakan|audit|evaluasi|optimalkan|optimasi|update|cek|uji|periksa|lihat|tampilkan|kirim|deploy|commit)\b/i;
const QUESTION_START = /^(?:arya[\s,:-]+)?(?:menurutmu|menurut kamu|bagaimana|gimana|apakah|apa|kenapa|mengapa|kalau|jika|bisakah|bolehkah|jelaskan|ceritakan|bahas|diskusikan)\b/i;
const DEEP_MARKER = /\b(?:menurutmu|menurut kamu|bandingkan|analisis|brainstorm|diskusi|diskusikan|jelaskan|strategi|trade[- ]?off|risiko|kenapa|mengapa|bagaimana|ide|pendapat)\b/i;
const PROJECT_MARKER = /\b(?:proyek|project|fitur|kode|coding|kantor ai|sistem|aplikasi|website|produk)\b/i;

/**
 * Classify inbound Telegram text before any project/tool work is started.
 * This classifier is deliberately conservative: a project keyword alone is
 * never an action request.
 */
export function classifyTelegramMessage(text) {
  const value = String(text || '').trim();
  const normalized = value.toLocaleLowerCase('id-ID');
  if (!value) return { intent: 'QUESTION', complexity: 'light', normalized };
  const discussionMarker = DEEP_MARKER.test(value) || QUESTION_START.test(value);
  if ((ACTION_START.test(value) && !discussionMarker) || (EXPLICIT_REQUEST.test(value) && !discussionMarker) || (ACTION_VERB.test(value) && !discussionMarker)) {
    return { intent: 'ACTION_REQUEST', complexity: value.length > 180 ? 'deep' : 'normal', normalized };
  }
  if (/^(?:bahas|diskusikan)\b/i.test(value) && PROJECT_MARKER.test(value)) {
    return { intent: 'PROJECT_DISCUSSION', complexity: 'normal', normalized };
  }
  if (DEEP_MARKER.test(value) || (value.length > 180 && PROJECT_MARKER.test(value) && !QUESTION_START.test(value))) {
    return { intent: 'DEEP_DISCUSSION', complexity: 'deep', normalized };
  }
  if (/[?？]$/.test(value) || QUESTION_START.test(value)) return { intent: 'QUESTION', complexity: 'light', normalized };
  if (PROJECT_MARKER.test(value)) return { intent: 'PROJECT_DISCUSSION', complexity: 'normal', normalized };
  return { intent: 'CASUAL_CHAT', complexity: 'light', normalized };
}

export const classifyTelegramIntent = classifyTelegramMessage;

const clone = value => structuredClone(value);
const validMessage = value => value && (value.role === 'user' || value.role === 'assistant') && typeof value.content === 'string' && value.content.trim();

/** Durable, bounded conversation memory. read/write are injected so the same
 * implementation works with JSON files and the PostgreSQL storage adapter. */
export function createTelegramConversationMemory({ read, write, maxMessages = 24, maxConversations = 200, maxSummary = 2400, maxLongTerm = 20 } = {}) {
  if (typeof read !== 'function' || typeof write !== 'function') throw new TypeError('Conversation memory read/write functions are required');
  let conversations = Object.create(null);
  let initialized = false;
  let queue = Promise.resolve();
  const persist = () => {
    const snapshot = clone({ conversations });
    queue = queue.catch(() => {}).then(() => write(snapshot));
    return queue;
  };
  async function init() {
    if (initialized) return;
    const stored = await read();
    const source = stored?.conversations && typeof stored.conversations === 'object' ? stored.conversations : {};
    conversations = Object.fromEntries(Object.entries(source).slice(-maxConversations).map(([key, value]) => [key, {
      updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
      summary: typeof value?.summary === 'string' ? value.summary.slice(0, maxSummary) : '',
      longTerm: Array.isArray(value?.longTerm) ? value.longTerm.filter(item => typeof item === 'string' && item.trim()).slice(-maxLongTerm).map(item => item.slice(0, 500)) : [],
      messages: Array.isArray(value?.messages) ? value.messages.filter(validMessage).slice(-maxMessages).map(item => ({ role: item.role, content: item.content.slice(0, 8000), createdAt: item.createdAt })) : [],
    }]));
    initialized = true;
  }
  async function get(key) { await init(); return clone(conversations[key]?.messages || []); }
  async function append(key, message) {
    if (typeof key !== 'string' || !key || !validMessage(message)) return;
    await init();
    const current = conversations[key] || { messages: [], summary: '', longTerm: [], updatedAt: new Date().toISOString() };
    const next = [...current.messages, { role: message.role, content: message.content.slice(0, 8000), createdAt: message.createdAt || new Date().toISOString() }];
    if (next.length > maxMessages) {
      const dropped = next.slice(0, next.length - maxMessages);
      const digest = dropped.map(item => `${item.role === 'user' ? 'Pengguna' : 'Arya'}: ${item.content}`).join(' | ');
      current.summary = [current.summary, digest].filter(Boolean).join(' | ').slice(-maxSummary);
    }
    current.messages = next.slice(-maxMessages);
    current.updatedAt = new Date().toISOString();
    conversations[key] = current;
    const keys = Object.keys(conversations);
    if (keys.length > maxConversations) {
      const oldest = keys.sort((a, b) => String(conversations[a].updatedAt).localeCompare(String(conversations[b].updatedAt)))[0];
      delete conversations[oldest];
    }
    await persist();
  }
  async function getSummary(key) { await init(); return String(conversations[key]?.summary || ''); }
  async function setSummary(key, summary) {
    if (typeof key !== 'string' || !key) return;
    await init();
    const current = conversations[key] || { messages: [], summary: '', longTerm: [], updatedAt: new Date().toISOString() };
    current.summary = typeof summary === 'string' ? summary.trim().slice(0, maxSummary) : '';
    current.updatedAt = new Date().toISOString(); conversations[key] = current; await persist();
  }
  async function getLongTerm(key) { await init(); return clone(conversations[key]?.longTerm || []); }
  async function setLongTerm(key, values) {
    if (typeof key !== 'string' || !key) return;
    await init();
    const current = conversations[key] || { messages: [], summary: '', longTerm: [], updatedAt: new Date().toISOString() };
    current.longTerm = Array.isArray(values) ? [...new Set(values.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, 500)))].slice(-maxLongTerm) : [];
    current.updatedAt = new Date().toISOString(); conversations[key] = current; await persist();
  }
  async function context(key) { await init(); return { messages: await get(key), summary: await getSummary(key), longTerm: await getLongTerm(key) }; }
  async function clear(key) { await init(); if (key) delete conversations[key]; else conversations = Object.create(null); await persist(); }
  async function snapshot(key) { await init(); return key ? clone(conversations[key] || { messages: [] }) : clone({ conversations }); }
  return { init, get, append, clear, snapshot, getSummary, setSummary, getLongTerm, setLongTerm, context };
}

