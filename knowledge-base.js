import { randomUUID, createHash } from 'node:crypto';

// Bounded, provenance preserving knowledge primitives.  The model must never
// receive a source that was not supplied by a caller.
export const KNOWLEDGE_TYPES = new Set(['document', 'sop', 'client', 'experience', 'error']);
export const MAX_ENTRIES = 500;
export const MAX_ENTRY_CHARS = 100_000;
export const MAX_TOTAL_CHARS = 2_000_000;
const tokenise = value => String(value || '').toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [];
const stamp = () => new Date().toISOString();

export function validateKnowledgeEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.id !== 'string' || !value.id || value.id.length > 120) return false;
  if (!KNOWLEDGE_TYPES.has(value.type) || typeof value.content !== 'string' || !value.content.trim() || value.content.length > MAX_ENTRY_CHARS) return false;
  if (typeof value.clientId !== 'string' || !value.clientId || value.clientId.length > 120) return false;
  if (value.projectId !== undefined && (typeof value.projectId !== 'string' || value.projectId.length > 120)) return false;
  if (!Number.isInteger(value.version) || value.version < 1) return false;
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt)) || typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) return false;
  if (!value.source || typeof value.source !== 'object' || Array.isArray(value.source) || typeof value.source.label !== 'string' || !value.source.label.trim() || value.source.label.length > 240) return false;
  if (value.source.uri !== undefined && (typeof value.source.uri !== 'string' || value.source.uri.length > 2000)) return false;
  if (value.access !== undefined && (!Array.isArray(value.access) || value.access.some(item => typeof item !== 'string' || item.length > 120))) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some(item => typeof item !== 'string' || item.length > 80))) return false;
  return true;
}

export function makeKnowledgeEntry(input = {}) {
  const now = stamp();
  const rawSource = input.source && typeof input.source === 'object' && !Array.isArray(input.source) ? input.source : {};
  const source = {
    label: String(rawSource.label || input.name || 'User supplied'),
    ...(rawSource.uri ? { uri: String(rawSource.uri) } : {}),
    ...(rawSource.host ? { host: String(rawSource.host).slice(0, 255) } : {}),
    ...(rawSource.fetchedAt && !Number.isNaN(Date.parse(rawSource.fetchedAt)) ? { fetchedAt: new Date(rawSource.fetchedAt).toISOString() } : {}),
    ...(typeof rawSource.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(rawSource.sha256) ? { sha256: rawSource.sha256.toLowerCase() } : {}),
    ...(typeof rawSource.truncated === 'boolean' ? { truncated: rawSource.truncated } : {}),
    ...(rawSource.quality && typeof rawSource.quality === 'object' && Number.isFinite(rawSource.quality.score) && rawSource.quality.score >= 0 && rawSource.quality.score <= 10 ? { quality: { label: String(rawSource.quality.label || 'ingestion_quality').slice(0, 80), score: Number(rawSource.quality.score), passed: Number(rawSource.quality.passed) || 0, applicable: Number(rawSource.quality.applicable) || 0, factualAccuracyEvaluated: rawSource.quality.factualAccuracyEvaluated === true } } : {}),
  };
  const entry = {
    id: typeof input.id === 'string' && input.id ? input.id : randomUUID(),
    type: KNOWLEDGE_TYPES.has(input.type) ? input.type : 'document',
    clientId: String(input.clientId || 'default'),
    ...(input.projectId ? { projectId: String(input.projectId) } : {}),
    content: String(input.content || '').slice(0, MAX_ENTRY_CHARS),
    source,
    version: Number.isInteger(input.version) && input.version > 0 ? input.version : 1,
    access: Array.isArray(input.access) ? [...new Set(input.access.map(String))].slice(0, 100) : ['*'],
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(String))].slice(0, 50) : [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
  if (!validateKnowledgeEntry(entry)) throw new Error('Invalid knowledge entry');
  return entry;
}

export function retrieveKnowledgeEntries(entries, query, options = {}) {
  const maxChars = Math.max(100, Math.min(20_000, Number(options.maxChars) || 6_000));
  const maxItems = Math.max(1, Math.min(20, Number(options.maxItems) || 8));
  const clientId = String(options.clientId || 'default');
  const projectId = options.projectId === undefined ? undefined : String(options.projectId);
  const actor = options.actor === undefined ? '*' : String(options.actor);
  const q = new Set(tokenise(query));
  const candidates = (Array.isArray(entries) ? entries : []).filter(validateKnowledgeEntry).filter(entry => entry.clientId === clientId && (projectId === undefined || !entry.projectId || entry.projectId === projectId) && (!entry.access?.length || entry.access.includes('*') || entry.access.includes(actor)));
  const scored = candidates.map(entry => {
    const words = tokenise(`${entry.content} ${(entry.tags || []).join(' ')}`);
    const score = words.reduce((sum, word) => sum + (q.has(word) ? 1 : 0), 0);
    return { entry, score };
  }).filter(item => item.score > 0 || q.size === 0).sort((a, b) => b.score - a.score || Date.parse(b.entry.updatedAt) - Date.parse(a.entry.updatedAt)).slice(0, maxItems);
  let out = '';
  for (const { entry } of scored) {
    const source = entry.source.uri ? `${entry.source.label} (${entry.source.uri})` : entry.source.label;
    const header = `[Source: ${source}; version ${entry.version}; type ${entry.type}]\n`;
    const room = maxChars - out.length - header.length - 1;
    if (room <= 0) break;
    out += `${header}${entry.content.slice(0, room)}\n`;
  }
  return out.slice(0, maxChars);
}

export function createKnowledgeStore({ storage, fileName = 'knowledge.json' } = {}) {
  if (!storage || typeof storage.readJson !== 'function' || typeof storage.writeJson !== 'function') throw new Error('Storage required');
  const fallback = { schemaVersion: 1, entries: [] };
  const valid = value => value && Number.isInteger(value.schemaVersion) && Array.isArray(value.entries) && value.entries.length <= MAX_ENTRIES && value.entries.every(validateKnowledgeEntry) && value.entries.reduce((sum, item) => sum + item.content.length, 0) <= MAX_TOTAL_CHARS;
  const load = () => storage.readJson(fileName, fallback, valid);
  const save = value => storage.writeJson(fileName, value);
  async function list(filters = {}) {
    const data = await load();
    return data.entries.filter(entry => (!filters.clientId || entry.clientId === filters.clientId) && (!filters.projectId || !entry.projectId || entry.projectId === filters.projectId));
  }
  async function add(input) {
    const data = await load(); const entry = makeKnowledgeEntry(input);
    if (data.entries.length >= MAX_ENTRIES || data.entries.reduce((sum, item) => sum + item.content.length, 0) + entry.content.length > MAX_TOTAL_CHARS) throw new Error('Knowledge capacity exceeded');
    data.entries.push(entry); await save(data); return entry;
  }
  async function update(id, patch) {
    const data = await load(); const index = data.entries.findIndex(entry => entry.id === id); if (index < 0) throw new Error('Knowledge entry not found');
    const previous = data.entries[index]; const next = makeKnowledgeEntry({ ...previous, ...patch, id, version: previous.version + 1, createdAt: previous.createdAt, updatedAt: stamp() });
    const total = data.entries.reduce((sum, item, i) => sum + (i === index ? next.content.length : item.content.length), 0); if (total > MAX_TOTAL_CHARS) throw new Error('Knowledge capacity exceeded');
    data.entries[index] = next; await save(data); return next;
  }
  async function recordExperience(input) { return add({ ...input, type: 'experience' }); }
  async function recordError(input) { return add({ ...input, type: 'error' }); }
  return { load, list, add, update, recordExperience, recordError, search: async (query, options) => retrieveKnowledgeEntries(await list(), query, options) };
}

export function knowledgeFingerprint(entry) { return createHash('sha256').update(JSON.stringify([entry.source, entry.version, entry.content])).digest('hex'); }
