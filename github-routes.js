import { createHash, createSign, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createGithubClient,
  normalizeRepository,
  normalizeRepositorySelection,
  sanitizeBranchName,
  operationPolicy,
  classifyGithubError,
  healthStatus,
} from './github-integration.js';

const stamp = () => new Date().toISOString();
const runFile = promisify(execFile);
const fail = (message, status = 400, details) => Object.assign(new Error(message), { status, details });
const idPattern = /^[A-Za-z0-9_.-]{1,100}$/;
const encode = value => encodeURIComponent(value);
const connectorFingerprint = item => createHash('sha256').update(JSON.stringify([item.installationId || null, item.token || null, item.account || null, item.allowedRepositories || []])).digest('hex');
const repoPath = repo => `/repos/${repo.split('/').map(encode).join('/')}`;
const safeRepo = value => normalizeRepository(value);
const publicConnector = (item, id) => ({
  id, type: 'github', name: item.name, account: item.account, avatarUrl: item.avatarUrl,
  scopes: item.scopes || [], allowedRepositories: item.allowedRepositories || [],
  permissions: item.permissions || { metadata: 'read', contents: 'write', pullRequests: 'write' },
  connected: Boolean(item.token) && (!item.tokenExpiresAt || Date.parse(item.tokenExpiresAt) > Date.now()), enabled: item.enabled !== false, updatedAt: item.updatedAt,
  lastCheckedAt: item.lastCheckedAt, health: item.health || 'unknown',
});

/** Install GitHub Integration Center routes. All write operations are approval gated. */
export function installGithubRoutes(app, {
  getSettings,
  updateSettings,
  activity = async () => {},
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof getSettings !== 'function' || typeof updateSettings !== 'function') throw new Error('GitHub routes require settings access.');
  const checks = new Map();
  const actions = new Map();
  const installationStates = new Map();
  const appConfig = () => ({ id: process.env.GITHUB_APP_ID, slug: process.env.GITHUB_APP_SLUG || process.env.GITHUB_APP_NAME, key: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n') });
  const appJwt = () => {
    const config = appConfig(); if (!config.id || !config.key) throw fail('GITHUB_APP_ID dan GITHUB_APP_PRIVATE_KEY belum dikonfigurasi di server.', 503);
    const now = Math.floor(Date.now() / 1000); const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iat: now - 60, exp: now + 540, iss: config.id })}`;
    const signer = createSign('RSA-SHA256'); signer.update(input); signer.end(); return `${input}.${signer.sign(config.key, 'base64url')}`;
  };
  const appRequest = async (path, options = {}, suppliedToken) => {
    const token = suppliedToken || appJwt();
    try {
      const response = await fetchImpl(new URL(path, 'https://api.github.com'), { ...options, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, ...(options.headers || {}) }, redirect: 'error' });
      const data = await response.json().catch(() => null);
      if (!response.ok) { const error = new Error(data?.message || `GitHub HTTP ${response.status}`); error.status = response.status; throw error; }
      return data;
    } catch (error) { throw githubError(error); }
  };
  const callbackPage = (req, payload, status = 200) => {
    const targetOrigin = payload.targetOrigin || 'http://127.0.0.1'; delete payload.targetOrigin;
    const nonce = randomUUID().replace(/-/g, '');
    const safe = JSON.stringify(payload).replace(/</g, '\\u003c');
    return res => res.status(status).type('html').set('Content-Security-Policy', `default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; script-src 'nonce-${nonce}'`).send(`<!doctype html><meta charset="utf-8"><title>GitHub Kantor AI</title><script nonce="${nonce}">const payload=${safe};if(window.opener){window.opener.postMessage({source:'harmes-github-app',...payload},${JSON.stringify(targetOrigin)});window.close()}else{document.body.textContent=payload.ok?'GitHub terhubung.':'GitHub gagal terhubung: '+payload.error}</script>`);
  };
  const connectorEntry = (requested, { allowExpired = false } = {}) => {
    const items = getSettings().integrations || {};
    const id = typeof requested === 'string' && requested ? requested : Object.keys(items).find(key => items[key]?.type === 'github' && items[key]?.enabled !== false);
    if (!id || !items[id] || items[id].type !== 'github') throw fail('GitHub belum terhubung. Klik Connect GitHub terlebih dahulu.', 409);
    if (items[id].enabled === false) throw fail('Koneksi GitHub dinonaktifkan.', 409);
    if (!items[id].token) throw fail('Koneksi GitHub belum terverifikasi.', 409);
    if (!allowExpired && items[id].tokenExpiresAt && Date.parse(items[id].tokenExpiresAt) <= Date.now()) throw fail('Token GitHub kedaluwarsa. Hubungkan kembali GitHub melalui browser.', 401, { code: 'auth' });
    return { id, item: items[id] };
  };
  const client = item => createGithubClient({ token: item.token, fetch: fetchImpl, timeoutMs: 15000 });
  const allowed = (item, repo) => {
    const selected = item.allowedRepositories || [];
    if (item.repositorySelection === 'selected') return selected.includes(repo);
    return !selected.length || selected.includes(repo);
  };
  const guardRepo = (item, value) => {
    const repo = safeRepo(value);
    if (!allowed(item, repo)) throw fail('Repository ini belum diizinkan untuk Kantor AI. Kelola akses lalu pilih repository tersebut.', 403, { code: 'repository_not_authorized', repository: repo });
    return repo;
  };
  const githubError = error => {
    const mapped = classifyGithubError(error);
    const status = error?.status === 401 ? 401 : error?.status === 403 ? 403 : error?.status === 404 ? 404 : error?.status === 409 ? 409 : error?.status === 422 ? 422 : error?.status >= 500 ? 502 : 502;
    return fail(mapped.message, status, { code: mapped.code });
  };
  const run = async (item, path, options) => {
    try { return await client(item).request(path, options); } catch (error) { throw githubError(error); }
  };
  const check = async (id, item, force = false) => {
    const cached = checks.get(id);
    if (!force && cached && Date.now() - cached.at < 30_000) return cached.value;
    if (item.tokenExpiresAt && Date.parse(item.tokenExpiresAt) <= Date.now()) {
      const value = { status: 'TOKEN EXPIRED', health: 'error', code: 'auth', error: 'Token GitHub kedaluwarsa. Hubungkan kembali melalui browser.', lastCheckedAt: stamp() };
      checks.set(id, { at: Date.now(), value }); return value;
    }
    try {
      const profile = await run(item, '/user');
      const repos = await run(item, '/user/repos?per_page=100&sort=updated');
      const visibleRepos = (Array.isArray(repos) ? repos : []).filter(repo => allowed(item, repo.full_name)).slice(0, 100);
      const value = { status: 'CONNECTED', health: 'healthy', account: profile.login || profile.name, username: profile.login, avatarUrl: profile.avatar_url, repositories: visibleRepos.map(repo => ({ id: repo.id, name: repo.name, fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch, permissions: repo.permissions || {}, htmlUrl: repo.html_url })), permissions: item.permissions || { metadata: 'read', contents: 'write', pullRequests: 'write' }, repositoryCount: visibleRepos.length, lastCheckedAt: stamp() };
      checks.set(id, { at: Date.now(), value });
      await updateSettings(next => { const current = next.integrations?.[id]; if (current) { current.account = value.account; current.avatarUrl = value.avatarUrl; current.lastCheckedAt = value.lastCheckedAt; current.health = value.health; } });
      return value;
    } catch (error) {
      const mapped = error.details || classifyGithubError(error);
      const value = { status: mapped.code === 'auth' ? 'TOKEN EXPIRED' : mapped.code === 'rate_limit' ? 'API RATE LIMITED' : mapped.code === 'forbidden' ? 'PERMISSION LIMITED' : 'NETWORK ERROR', health: 'error', error: mapped.message, code: mapped.code, lastCheckedAt: stamp() };
      checks.set(id, { at: Date.now(), value });
      return value;
    }
  };
  const actionFor = req => {
    const action = actions.get(req.params.actionId);
    if (!action || action.owner !== req.sessionId || Date.now() > action.expiresAt) { if (action) actions.delete(req.params.actionId); throw fail('Tindakan GitHub tidak ditemukan atau sudah kedaluwarsa.', 404); }
    return action;
  };
  app.get('/api/github/cli/status', async (req, res) => {
    try {
      const result = await runFile(process.platform === 'win32' ? 'gh.exe' : 'gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 10_000, windowsHide: true, maxBuffer: 32_000 });
      res.json({ available: true, authenticated: true, status: 'CONNECTED', detail: String(result.stdout || result.stderr).slice(0, 2000) });
    } catch (error) {
      const detail = String(error.stdout || error.stderr || error.message || '').slice(0, 2000);
      const missing = error.code === 'ENOENT';
      res.json({ available: !missing, authenticated: false, status: missing ? 'CLI NOT INSTALLED' : 'REAUTHENTICATION REQUIRED', detail, recovery: missing ? 'Instal GitHub CLI lalu jalankan gh auth login --web.' : 'Jalankan gh auth login --web.' });
    }
  });

  app.get('/api/github/app/authorize', (req, res) => {
    const config = appConfig();
    if (!config.slug || !config.id || !config.key) return res.status(503).json({ error: 'GitHub App belum dikonfigurasi. Gunakan GitHub CLI browser sebagai fallback.' });
    const origin = `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${origin}/api/github/app/callback`;
    const sessionBinding = createHash('sha256').update(String(req.headers.cookie || '')).digest('hex');
    const state = randomUUID(); installationStates.set(state, { createdAt: Date.now(), redirectUri, targetOrigin: origin, sessionBinding });
    for (const [key, value] of installationStates) if (Date.now() - value.createdAt > 10 * 60_000) installationStates.delete(key);
    while (installationStates.size > 1000) installationStates.delete(installationStates.keys().next().value);
    const url = new URL(`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`);
    url.searchParams.set('state', state); url.searchParams.set('redirect_uri', redirectUri);
    res.json({ url: url.toString(), state, permissions: { metadata: 'read', contents: 'write', pullRequests: 'write' }, repositorySelection: 'selected' });
  });
  app.get('/api/github/app/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? installationStates.get(req.query.state) : null;
    if (typeof req.query.state === 'string') installationStates.delete(req.query.state);
    if (!state || Date.now() - state.createdAt > 10 * 60_000) return callbackPage(req, { ok: false, error: 'Sesi otorisasi GitHub kedaluwarsa atau sudah digunakan.' }, 400)(res);
    const callbackBinding = createHash('sha256').update(String(req.headers.cookie || '')).digest('hex');
    if (!state.sessionBinding || callbackBinding !== state.sessionBinding) return callbackPage(req, { ok: false, error: 'Sesi browser GitHub tidak cocok. Mulai koneksi kembali.', targetOrigin: state.targetOrigin }, 403)(res);
    if (req.query.error) return callbackPage(req, { ok: false, error: 'Otorisasi GitHub dibatalkan.', targetOrigin: state.targetOrigin })(res);
    const installationId = String(req.query.installation_id || '');
    if (!/^\d{1,30}$/.test(installationId)) return callbackPage(req, { ok: false, error: 'Installation GitHub tidak valid.', targetOrigin: state.targetOrigin }, 400)(res);
    try {
      const tokenData = await appRequest(`/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!tokenData?.token) throw fail('GitHub tidak memberikan installation token.', 502);
      const repositories = await appRequest('/installation/repositories?per_page=100', {}, tokenData.token);
      const repoList = (repositories?.repositories || []).slice(0, 100).map(repo => ({ id: repo.id, name: repo.name, fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch, htmlUrl: repo.html_url, avatarUrl: repo.owner?.avatar_url, permissions: repo.permissions || {} }));
      const account = repositories?.repository_selection === 'selected' ? (repoList[0]?.fullName?.split('/')[0] || 'GitHub') : 'GitHub';
      const id = 'github-app'; const item = { id, type: 'github', name: 'GitHub App', baseUrl: 'https://api.github.com', account, avatarUrl: repoList[0]?.avatarUrl, token: tokenData.token, tokenExpiresAt: tokenData.expires_at, installationId, scopes: ['metadata:read', 'contents:write', 'pull_requests:write'], permissions: tokenData.permissions || { metadata: 'read', contents: 'write', pullRequests: 'write' }, allowedRepositories: repoList.map(repo => repo.fullName), repositorySelection: repositories?.repository_selection || 'selected', enabled: true, approvalRequired: true, health: 'healthy', lastCheckedAt: stamp(), updatedAt: stamp() };
      await updateSettings(next => { next.integrations ||= {}; next.integrations[id] = { ...next.integrations[id], ...item }; });
      await activity('GitHub App terhubung', account, 'integration');
      return callbackPage(req, { ok: true, provider: 'github', account, targetOrigin: state.targetOrigin })(res);
    } catch (error) { const mapped = error.details || classifyGithubError(error); return callbackPage(req, { ok: false, error: mapped.message, targetOrigin: state.targetOrigin }, error.status || 502)(res); }
  });

  app.get('/api/github/status', async (req, res) => {
    const { id, item } = connectorEntry(req.query.connectorId, { allowExpired: true });
    const result = await check(id, item, req.query.refresh === '1');
    res.json({ connector: publicConnector(item, id), ...result });
  });
  app.get('/api/github/repositories', async (req, res) => {
    const { id, item } = connectorEntry(req.query.connectorId);
    const status = await check(id, item, req.query.refresh === '1');
    let repositories = status.repositories || [];
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase().slice(0, 100) : '';
    if (search) repositories = repositories.filter(repo => `${repo.name} ${repo.fullName}`.toLowerCase().includes(search));
    res.json({ repositories, selected: item.allowedRepositories || [], status: status.status, lastCheckedAt: status.lastCheckedAt });
  });
  app.post('/api/github/repositories/select', async (req, res) => {
    const { id, item } = connectorEntry(req.body?.connectorId);
    let selected;
    try { selected = normalizeRepositorySelection(req.body?.repositories); } catch (error) { throw fail(error.message); }
    const status = await check(id, item, true);
    const available = new Set((status.repositories || []).map(repo => repo.fullName));
    if (selected.some(repo => !available.has(repo))) throw fail('Pilih repository yang sudah diotorisasi pada GitHub.', 403, { code: 'repository_not_authorized' });
    await updateSettings(next => { const current = next.integrations?.[id]; if (current) { current.allowedRepositories = selected; current.repositorySelection = 'selected'; current.updatedAt = stamp(); } });
    await activity('Repository GitHub dipilih', selected.join(', ') || 'Semua repository yang diizinkan', 'integration');
    res.json({ connector: publicConnector(getSettings().integrations[id], id), selected });
  });
  app.get('/api/github/repos/:owner/:repo', async (req, res) => {
    if (!idPattern.test(req.params.owner) || !idPattern.test(req.params.repo)) throw fail('Repository GitHub tidak valid.');
    const { item } = connectorEntry(req.query.connectorId);
    const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    const data = await run(item, repoPath(repo));
    res.json({ repository: data });
  });
  app.get('/api/github/repos/:owner/:repo/branches', async (req, res) => {
    const { item } = connectorEntry(req.query.connectorId); const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    res.json({ branches: await run(item, `${repoPath(repo)}/branches?per_page=100`) });
  });
  app.get('/api/github/repos/:owner/:repo/contents', async (req, res) => {
    const { item } = connectorEntry(req.query.connectorId); const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    const path = typeof req.query.path === 'string' ? req.query.path.replace(/^\/+/, '') : '';
    if (path.length > 500 || path.includes('..')) throw fail('Path repository tidak valid.');
    const ref = typeof req.query.ref === 'string' ? `?ref=${encodeURIComponent(req.query.ref.slice(0, 120))}` : '';
    res.json({ contents: await run(item, `${repoPath(repo)}/contents/${path.split('/').filter(Boolean).map(encode).join('/')}${ref}`) });
  });
  app.get('/api/github/repos/:owner/:repo/commits', async (req, res) => {
    const { item } = connectorEntry(req.query.connectorId); const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    res.json({ commits: await run(item, `${repoPath(repo)}/commits?per_page=50`) });
  });
  app.get('/api/github/repos/:owner/:repo/compare', async (req, res) => {
    const { item } = connectorEntry(req.query.connectorId); const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    if (typeof req.query.base !== 'string' || typeof req.query.head !== 'string') throw fail('Base dan head wajib diisi.');
    res.json({ comparison: await run(item, `${repoPath(repo)}/compare/${encodeURIComponent(req.query.base) }...${encodeURIComponent(req.query.head)}`) });
  });
  app.get('/api/github/repos/:owner/:repo/pulls', async (req, res) => {
    const { item } = connectorEntry(req.query.connectorId); const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    res.json({ pullRequests: await run(item, `${repoPath(repo)}/pulls?state=all&per_page=50`) });
  });
  app.get('/api/github/repos/:owner/:repo/issues', async (req, res) => {
    const { item } = connectorEntry(req.query.connectorId); const repo = guardRepo(item, `${req.params.owner}/${req.params.repo}`);
    res.json({ issues: await run(item, `${repoPath(repo)}/issues?state=all&per_page=50`) });
  });
  app.post('/api/github/operations/preview', (req, res) => {
    for (const [key, value] of actions) if (Date.now() > value.expiresAt) actions.delete(key);
    if (actions.size >= 100) throw fail('Terlalu banyak pratinjau GitHub. Tunggu beberapa menit.', 429);
    const { id, item } = connectorEntry(req.body?.connectorId); const operation = String(req.body?.operation || '').toLowerCase();
    const repo = guardRepo(item, req.body?.repository); const branch = sanitizeBranchName(req.body?.branch, 'work');
    const policy = operationPolicy(operation, { ...req.body, branch, repository: repo });
    if (!policy.allowed) throw fail(policy.reason, 403, { code: 'operation_blocked' });
    if (!['create_branch', 'update_file', 'create_pull_request', 'create_issue'].includes(operation)) throw fail('Operasi GitHub belum didukung oleh pusat integrasi.');
    if (['update_file', 'create_pull_request', 'create_issue'].includes(operation) && !policy.requiresApproval) throw fail('Persetujuan pemilik diperlukan.');
    const action = { id: randomUUID(), connectorId: id, operation, repository: repo, branch, payload: req.body?.payload || {}, owner: req.sessionId, connectorFingerprint: connectorFingerprint(item), createdAt: stamp(), expiresAt: Date.now() + 10 * 60_000, status: 'pending' };
    actions.set(action.id, action);
    res.status(201).json({ action: { id: action.id, operation, repository: repo, branch, status: action.status, expiresAt: new Date(action.expiresAt).toISOString(), requiresApproval: true } });
  });
  app.post('/api/github/operations/:actionId/approve', async (req, res) => {
    const action = actionFor(req); if (action.status !== 'pending') throw fail('Tindakan GitHub sudah diproses. Buat pratinjau baru.', 409); if (req.body?.approved !== true) throw fail('Persetujuan eksplisit diperlukan.');
    const { item } = connectorEntry(action.connectorId); action.status = 'executing';
    if (connectorFingerprint(item) !== action.connectorFingerprint) { action.status = 'failed'; throw fail('Koneksi atau izin repository berubah. Buat pratinjau baru.', 409); }
    const repo = guardRepo(item, action.repository); const policy = operationPolicy(action.operation, { branch: action.branch, repository: repo, ...action.payload });
    if (!policy.allowed) { action.status = 'failed'; throw fail(policy.reason, 403, { code: 'operation_blocked' }); }
    try {
      const base = repoPath(action.repository); let result;
      if (action.operation === 'create_branch') {
        const branch = sanitizeBranchName(action.branch);
        const source = action.payload?.sha || (await run(item, `${base}/git/ref/heads/${encodeURIComponent(action.payload?.from || 'main')}`)).object?.sha;
        if (!source) throw fail('Commit sumber branch tidak ditemukan.', 422);
        result = await run(item, `${base}/git/refs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: source }) });
      } else if (action.operation === 'update_file') {
        const file = typeof action.payload?.path === 'string' ? action.payload.path.replace(/^\/+/, '') : '';
        if (!file || file.includes('..') || file.startsWith('.env') || file.includes('/.git/')) throw fail('Berkas sensitif atau path tidak valid.', 403);
        const content = typeof action.payload?.content === 'string' ? Buffer.from(action.payload.content).toString('base64') : '';
        if (!content || content.length > 2_000_000) throw fail('Isi berkas tidak valid atau terlalu besar.');
        result = await run(item, `${base}/contents/${file.split('/').map(encode).join('/')}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: String(action.payload?.message || 'Update melalui Kantor AI').slice(0, 200), content, branch: action.branch, sha: action.payload?.sha }) });
      } else if (action.operation === 'create_pull_request') {
        if (['main', 'master', 'production', 'prod'].includes(action.branch.toLowerCase())) throw fail('Pull request harus berasal dari branch kerja.', 403);
        result = await run(item, `${base}/pulls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: String(action.payload?.title || '').slice(0, 250), body: String(action.payload?.body || '').slice(0, 10000), head: action.branch, base: String(action.payload?.base || 'main') }) });
      } else {
        result = await run(item, `${base}/issues`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: String(action.payload?.title || '').slice(0, 250), body: String(action.payload?.body || '').slice(0, 10000) }) });
      }
      action.status = 'completed'; await activity(`GitHub ${action.operation}`, action.repository, 'integration'); res.json({ ok: true, operation: action.operation, result });
    } catch (error) { action.status = 'failed'; throw error; }
  });
  app.post('/api/github/disconnect', async (req, res) => {
    // Removing a connector revokes the local capability and must never happen
    // from an accidental/replayed request. Keep this gate aligned with the
    // GitHub revoke and workspace connector removal flows.
    if (req.body?.approved !== true) throw fail('Persetujuan eksplisit diperlukan untuk melepas koneksi GitHub.');
    const requested = req.body?.connectorId; const { id } = connectorEntry(requested);
    await updateSettings(next => { if (next.integrations?.[id]) delete next.integrations[id]; });
    checks.delete(id); await activity('GitHub dilepas', id, 'integration'); res.status(204).end();
  });
  app.post('/api/github/revoke', async (req, res) => {
    if (req.body?.approved !== true) throw fail('Persetujuan eksplisit diperlukan untuk mencabut akses GitHub.');
    const requested = req.body?.connectorId; const { id, item } = connectorEntry(requested);
    if (!item.installationId) throw fail('Koneksi ini tidak memakai GitHub App. Cabut OAuth dari pengaturan GitHub App.', 409);
    await appRequest(`/app/installations/${encodeURIComponent(item.installationId)}`, { method: 'DELETE' });
    await updateSettings(next => { if (next.integrations?.[id]) delete next.integrations[id]; });
    checks.delete(id); await activity('Akses GitHub dicabut', id, 'integration'); res.status(204).end();
  });
}

export { publicConnector };
