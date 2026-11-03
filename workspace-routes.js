import { createHash, randomUUID } from 'node:crypto';
import { validateDocument, inspectConnector, previewTelegram } from './workspace-features.js';
import { KNOWLEDGE_TYPES, makeKnowledgeEntry, retrieveKnowledgeEntries, MAX_ENTRY_CHARS } from './knowledge-base.js';
import { runProductionAudit } from './production-audit.js';
import { fetchWebDocument, evaluateIngestion } from './web-ingestion.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const fingerprint = item => createHash('sha256').update(JSON.stringify([item.type, item.baseUrl, item.token, item.enabled])).digest('hex');
const stamp = () => new Date().toISOString();

export function installWorkspaceRoutes(app, { getState, getSettings, getPerformance, getWorkflow, save, activity, fetchJson, telegramBase, inspect = inspectConnector, ingest = fetchWebDocument }) {
  const actions = new Map();
  app.get('/api/production/audit', (req, res) => res.json(runProductionAudit({ root: process.cwd(), settings: getSettings(), workflow: getWorkflow?.() })));
  const connector = id => {
    const items = getSettings().integrations || {};
    if (!Object.hasOwn(items, id)) throw fail('Konektor tidak ditemukan.', 404);
    const item = items[id];
    if (item.enabled === false) throw fail('Konektor dinonaktifkan.', 409);
    return item;
  };
  function cleanup() {
    for (const [id, action] of actions) if (Date.now() - action.createdMs > 10 * 60_000) actions.delete(id);
  }
  const clientOf = req => {
    const value = req.headers['x-client-id'] || req.body?.clientId || 'default';
    return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : 'default';
  };
  const visible = (doc, req) => (doc.clientId || 'default') === clientOf(req) && (!doc.access?.length || doc.access.includes('*'));
  app.get('/api/documents', (req, res) => res.json({ documents: (getState().documents || []).filter(doc => visible(doc, req)).map(({ content, ...metadata }) => ({ ...metadata, characters: content.length })) }));
  app.get('/api/knowledge', (req, res) => { const state=getState(); const docs=(state.knowledge?.documents||state.documents||[]).filter(doc=>visible(doc,req)); res.json({documents:docs.map(({content,...meta})=>({...meta,characters:typeof content==='string'?content.length:meta.characters||0}))}); });
  app.get('/api/performance', (req, res) => { const state=getState(); const performance=typeof getPerformance==='function'?getPerformance():null; res.json({agents:performance?.capabilities?.agents||state.capabilities?.agents||state.agents||[],benchmarks:performance?.benchmarks||state.benchmarks||state.evaluations||[],intelligence:performance?.intelligence||state.intelligence||null,generatedAt:stamp()}); });
  app.get('/api/employees/:agentId/profile', (req, res) => { const performance=typeof getPerformance==='function'?getPerformance():null; const agent=(performance?.capabilities?.agents||[]).find(item=>item.agentId===req.params.agentId||item.employee_id===req.params.agentId); if(!agent)return res.status(404).json({error:'Karyawan tidak ditemukan.'}); res.json({profile:agent.professionalProfile||agent}); });
  app.get('/api/operations/intelligence', (req, res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow)return res.status(503).json({error:'Workflow belum siap.'}); res.json({experiences:workflow.listExperience(req.query||{}),errors:workflow.listErrors(req.query||{}),versions:workflow.listVersions(req.query.kind,req.query.key)}); });
  app.get('/api/benchmarks', (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; res.json({benchmarks:workflow?.listBenchmarks?.()||[]}); });
  app.post('/api/benchmarks', async (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow?.registerBenchmark)return res.status(503).json({error:'Benchmark belum siap.'}); try{res.status(201).json({benchmark:await workflow.registerBenchmark(req.body||{})});}catch(error){res.status(error.status||400).json({error:error.message});} });
  app.post('/api/benchmarks/:benchmarkId/run', async (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow?.runBenchmark)return res.status(503).json({error:'Benchmark belum siap.'}); try{res.status(201).json({result:await workflow.runBenchmark(req.params.benchmarkId,req.body?.agentId,{projectId:req.body?.projectId})});}catch(error){res.status(error.status||400).json({error:error.message});} });
  app.post('/api/operations/projects/:projectId/experience', async (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow)return res.status(503).json({error:'Workflow belum siap.'}); try{res.status(201).json({experience:await workflow.recordExperience({...req.body,projectId:req.params.projectId})});}catch(error){res.status(error.status||400).json({error:error.message});} });
  app.post('/api/operations/projects/:projectId/errors', async (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow)return res.status(503).json({error:'Workflow belum siap.'}); try{res.status(201).json({errorRecord:await workflow.recordError({...req.body,projectId:req.params.projectId})});}catch(error){res.status(error.status||400).json({error:error.message});} });
  app.post('/api/operations/versions', async (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow)return res.status(503).json({error:'Workflow belum siap.'}); try{res.status(201).json({version:await workflow.publishVersion(req.body||{})});}catch(error){res.status(error.status||400).json({error:error.message});} });
  app.post('/api/operations/versions/:kind/:key/:version/rollback', async (req,res) => { const workflow=typeof getWorkflow==='function'?getWorkflow():null; if(!workflow)return res.status(503).json({error:'Workflow belum siap.'}); try{res.json({version:await workflow.rollbackVersion(req.params.kind,req.params.key,Number(req.params.version))});}catch(error){res.status(error.status||400).json({error:error.message});} });
  app.post('/api/documents', async (req, res) => {
    const { name, content } = req.body || {};
    if (!validateDocument({ name, content }) || !name.trim() || !content.trim()) throw fail('Dokumen harus TXT, Markdown, CSV, atau JSON; maksimal 100.000 karakter.');
    const documents = getState().documents ||= [];
    if (documents.length >= 20 || documents.reduce((sum, doc) => sum + doc.content.length, 0) + content.length > 1_000_000) throw fail('Batas basis pengetahuan tercapai: 20 dokumen atau 1 juta karakter.', 409);
    const type = KNOWLEDGE_TYPES.has(req.body?.type) ? req.body.type : 'document';
    const document = makeKnowledgeEntry({ id: randomUUID(), type, clientId: clientOf(req), projectId: req.body?.projectId, name: name.trim(), content, source: req.body?.source || { label: name.trim() }, version: 1, access: ['*'], tags: req.body?.tags });
    document.name = name.trim();
    documents.push(document); await save();
    const { content: omitted, ...metadata } = document;
    res.status(201).json({ document: { ...metadata, characters: content.length } });
  });
  app.delete('/api/documents/:id', async (req, res) => {
    const state = getState();
    if (!state.documents?.some(doc => doc.id === req.params.id && visible(doc, req))) throw fail('Dokumen tidak ditemukan.', 404);
    state.documents = state.documents.filter(doc => doc.id !== req.params.id); await save(); res.status(204).end();
  });
  async function recordLearning(req, res, type) {
    const body = req.body || {};
    if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > MAX_ENTRY_CHARS) throw fail('Catatan pembelajaran tidak valid.');
    const documents = getState().documents ||= [];
    if (documents.length >= 20 || documents.reduce((sum, doc) => sum + doc.content.length, 0) + body.content.length > 1_000_000) throw fail('Batas basis pengetahuan tercapai.', 409);
    const entry = makeKnowledgeEntry({ type, clientId: clientOf(req), projectId: body.projectId, content: body.content, source: body.source || { label: body.sourceLabel || 'User supplied' }, tags: body.tags });
    entry.name = `${type}-${entry.id}.md`; documents.push(entry); await save();
    const { content, ...metadata } = entry; res.status(201).json({ entry: { ...metadata, characters: content.length } });
  }
  app.post('/api/knowledge/experience', (req, res) => recordLearning(req, res, 'experience'));
  app.post('/api/knowledge/errors', (req, res) => recordLearning(req, res, 'error'));
  app.get('/api/knowledge/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const maxChars = Math.min(20_000, Math.max(100, Number(req.query.maxChars) || 6_000));
    const docs = (getState().documents || []).filter(doc => visible(doc, req));
    // Return snippets plus provenance only; raw records remain private.
    res.json({ query, knowledge: retrieveKnowledgeEntries(docs.map(doc => ({ id: doc.id, type: doc.type || 'document', clientId: doc.clientId || 'default', projectId: doc.projectId, content: doc.content, source: doc.source || { label: doc.name }, version: doc.version || 1, access: doc.access || ['*'], tags: doc.tags || [], createdAt: doc.createdAt || doc.updatedAt, updatedAt: doc.updatedAt })), query, { clientId: clientOf(req), maxChars }) });
  });
  // Web ingestion is explicit, bounded, provenance preserving, and never
  // executes automatically from a chat prompt. The fetcher enforces robots,
  // public-host, content-type, byte, and timeout policy.
  app.post('/api/knowledge/ingest', async (req, res) => {
    const body = req.body || {};
    if (typeof body.url !== 'string' || body.url.length > 2000) throw fail('URL sumber wajib diisi.');
    const type = KNOWLEDGE_TYPES.has(body.type) ? body.type : 'document';
    const documents = getState().documents ||= [];
    if (documents.length >= 20) throw fail('Batas basis pengetahuan tercapai: 20 dokumen.', 409);
    let fetched;
    try { fetched = await ingest({ url: body.url }); }
    catch (error) { throw fail(error?.message || 'Sumber web gagal dibaca.', 502); }
    if (!fetched || typeof fetched.content !== 'string' || !fetched.content.trim() || !fetched.source || typeof fetched.source.uri !== 'string') throw fail('Sumber web tidak menghasilkan dokumen berprovenansi.', 502);
    // Recheck after the asynchronous fetch; concurrent requests may have
    // filled the knowledge base while this request was in flight.
    if (getState().documents.length >= 20) throw fail('Batas basis pengetahuan tercapai: 20 dokumen.', 409);
    const quality = evaluateIngestion(fetched);
    if (quality.passed < quality.applicable /* factual accuracy is intentionally not auto-claimed */) throw fail('Kualitas tangkapan sumber tidak memenuhi pemeriksaan metadata.', 502);
    const source = { ...fetched.source, host: fetched.source.host || new URL(fetched.source.uri).hostname, fetchedAt: fetched.source.fetchedAt || fetched.fetchedAt, sha256: fetched.source.sha256 || fetched.sha256, truncated: fetched.source.truncated ?? fetched.truncated, quality };
    const uri = source.uri;
    const duplicate = documents.find(doc => doc.clientId === clientOf(req) && uri && doc.source?.uri === uri && doc.source?.sha256 === source.sha256);
    if (duplicate) return res.status(200).json({ document: { id: duplicate.id, duplicate: true, version: duplicate.version, source: duplicate.source, characters: duplicate.content.length } });
    const total = documents.reduce((sum, doc) => sum + String(doc.content || '').length, 0);
    if (total + fetched.content.length > 1_000_000) throw fail('Batas basis pengetahuan tercapai: 1 juta karakter.', 409);
    const entry = makeKnowledgeEntry({ id: randomUUID(), type, clientId: clientOf(req), projectId: body.projectId, content: fetched.content, source, tags: body.tags });
    entry.name = `${new URL(source.uri).hostname}-${entry.id}.md`;
    documents.push(entry); await save();
    const { content, ...metadata } = entry;
    res.status(201).json({ document: { ...metadata, characters: content.length, ingestionQuality: quality } });
  });
  app.post('/api/integrations/:id/inspect', async (req, res) => {
    const item = connector(req.params.id);
    if (!['github', 'web'].includes(item.type)) throw fail('Pembacaan tersedia untuk GitHub dan Website / CMS.');
    const repository = req.body?.repository;
    if (repository !== undefined && typeof repository !== 'string') throw fail('Repository tidak valid.');
    try {
      const result = await inspect(item.type === 'web' ? { ...item, type: 'cms' } : item, { repository });
      await activity('Data konektor dibaca', item.name, 'integration');
      res.json({ result });
    } catch { throw fail('Data gagal dibaca. Periksa URL, izin token, dan ketersediaan layanan.', 502); }
  });
  app.post('/api/integrations/:id/actions', (req, res) => {
    cleanup();
    const item = connector(req.params.id);
    if (item.type !== 'telegram' || !item.token) throw fail('Hubungkan bot Telegram terlebih dahulu.', 409);
    if (actions.size >= 100) throw fail('Terlalu banyak pratinjau. Tunggu beberapa menit.', 429);
    let preview; try { preview = previewTelegram(req.body || {}); } catch { throw fail('Chat ID atau pesan Telegram tidak valid.'); }
    const createdMs = Date.now();
    const action = { id: randomUUID(), type: 'telegram.send', connectorId: req.params.id, chatId: preview.chatId, text: preview.text, status: 'pending', createdMs, expiresAt: new Date(createdMs + 10 * 60_000).toISOString(), owner: req.sessionId, fingerprint: fingerprint(item) };
    actions.set(action.id, action);
    res.status(201).json({ action: { id: action.id, type: action.type, chatId: action.chatId, text: action.text, status: action.status, expiresAt: action.expiresAt } });
  });
  app.post('/api/actions/:id/approve', async (req, res) => {
    cleanup();
    const action = actions.get(req.params.id);
    if (!action || action.owner !== req.sessionId) throw fail('Pratinjau tidak ditemukan atau kedaluwarsa.', 404);
    if (req.body?.approved !== true) throw fail('Persetujuan eksplisit diperlukan.');
    if (action.status !== 'pending') throw fail('Tindakan ini sudah diproses. Buat pratinjau baru bila perlu.', 409);
    const item = connector(action.connectorId);
    if (action.fingerprint !== fingerprint(item)) throw fail('Koneksi berubah. Buat pratinjau baru.', 409);
    // Mark consumed before any await. A timeout may mean delivery succeeded;
    // never retry an external write automatically.
    action.status = 'executing';
    let response;
    try {
      response = await fetchJson(`${telegramBase}/bot${encodeURIComponent(item.token)}/sendMessage`, { method: 'POST', body: JSON.stringify({ chat_id: action.chatId, text: action.text }) }, 15000);
      if (response.ok !== true || !response.result?.message_id) throw new Error('Telegram rejected message');
    } catch {
      action.status = 'failed';
      try { await activity('Pengiriman Telegram perlu diperiksa', `${item.name} · periksa tujuan sebelum mencoba kembali`, 'error'); }
      catch (error) { console.error('Telegram activity persistence failed:', error.name); }
      throw fail('Pengiriman belum dapat dipastikan. Periksa Telegram sebelum membuat pratinjau baru.', 502);
    }
    action.status = 'completed';
    // Delivery was acknowledged. A local audit write failure cannot undo it or
    // invite a duplicate send by reporting the action as failed.
    try { await activity('Pesan Telegram dikirim', `${item.name} · tujuan ${action.chatId}`, 'integration'); }
    catch (error) { console.error('Telegram activity persistence failed:', error.name); }
    res.json({ ok: true, action: { id: action.id, status: action.status }, messageId: response.result.message_id });
  });
}
