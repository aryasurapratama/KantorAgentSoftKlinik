const API_ORIGIN = 'https://api.github.com';
const RESERVED_BRANCHES = new Set(['main', 'master', 'production', 'prod']);

export function githubApiUrl(pathname = '') {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) throw new Error('GitHub API path tidak valid.');
  const url = new URL(pathname, API_ORIGIN);
  if (url.origin !== API_ORIGIN) throw new Error('Host GitHub tidak diizinkan.');
  return url;
}

export function normalizeRepository(value) {
  if (typeof value !== 'string') throw new Error('Repository GitHub wajib berupa pemilik/nama.');
  const input = value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(input) || input.includes('..')) throw new Error('Repository GitHub tidak valid. Gunakan pemilik/nama.');
  return input;
}

export function normalizeRepositorySelection(value) {
  if (Array.isArray(value)) return [...new Set(value.map(normalizeRepository))];
  if (value === undefined || value === null || value === '') return [];
  return [normalizeRepository(value)];
}

export function sanitizeBranchName(value, fallback = 'work') {
  let branch = typeof value === 'string' ? value.trim() : '';
  branch = branch.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^[-/.]+|[-/.]+$/g, '').replace(/\/{2,}/g, '/').slice(0, 120);
  if (!branch || branch === '@' || branch.split('/').some(part => part === '.' || part === '..')) branch = fallback;
  return branch;
}

export function operationPolicy(operation, options = {}) {
  const op = String(operation || '').toLowerCase();
  const branch = String(options.branch || options.ref || '').toLowerCase();
  if (options.force === true || op.includes('force')) return { allowed: false, reason: 'Operasi force pada GitHub diblokir.' };
  if (op.includes('secret') || op.includes('credential') || op.includes('token')) return { allowed: false, reason: 'Operasi terhadap secret GitHub diblokir.' };
  if (op.includes('delete')) return { allowed: false, reason: 'Penghapusan resource GitHub memerlukan jalur manual.' };
  if ((op.includes('push') || op.includes('write') || op.includes('merge') || op.includes('commit') || op.includes('update') || op.includes('branch')) && RESERVED_BRANCHES.has(branch)) return { allowed: false, reason: 'Perubahan langsung ke branch utama diblokir.' };
  return { allowed: true, requiresApproval: /write|update|push|merge|commit|branch|pull|issue|release|delete/.test(op) };
}

export function classifyGithubError(error, status) {
  const code = Number(status ?? error?.status ?? error?.response?.status);
  const message = String(error?.message || '').toLowerCase();
  if (code === 401 || message.includes('bad credentials')) return { code: 'auth', message: 'Token GitHub tidak valid atau kedaluwarsa.' };
  if (message.includes('rate limit') || message.includes('api rate')) return { code: 'rate_limit', message: 'Batas API GitHub tercapai. Tunggu sebelum mencoba lagi.' };
  if (code === 403) return { code: 'forbidden', message: 'GitHub menolak permintaan karena izin tidak mencukupi.' };
  if (code === 404) return { code: 'not_found', message: 'Repository atau resource GitHub tidak ditemukan.' };
  if (code === 409) return { code: 'conflict', message: 'GitHub melaporkan konflik. Muat ulang data lalu coba lagi.' };
  if (code === 422) return { code: 'validation', message: 'GitHub menolak data permintaan.' };
  if (code >= 500) return { code: 'upstream', message: 'GitHub sedang bermasalah. Coba lagi nanti.' };
  if (error?.name === 'AbortError' || message.includes('timeout')) return { code: 'timeout', message: 'GitHub tidak merespons tepat waktu.' };
  return { code: 'network', message: 'GitHub tidak dapat dihubungi.' };
}

export function healthStatus({ status, error } = {}) {
  if (error) return { status: 'error', ...classifyGithubError(error, status) };
  const code = Number(status);
  if (code === 401) return { status: 'unauthorized', ...classifyGithubError(null, code) };
  if (code === 403) return { status: 'degraded', ...classifyGithubError(null, code) };
  if (code >= 200 && code < 300) return { status: 'healthy', code: 'ok', message: 'GitHub siap digunakan.' };
  return { status: 'unknown', ...classifyGithubError(null, code) };
}

export function createGithubClient({ token, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch GitHub tidak tersedia.');
  return { async request(pathname, options = {}) {
    const url = githubApiUrl(pathname); const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { accept: 'application/vnd.github+json', 'user-agent': 'Kantor-AI', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
      const response = await fetchImpl(url, { ...options, headers, signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal, redirect: 'error' });
      let body; try { body = await response.json(); } catch { body = null; }
      if (!response.ok) { const e = new Error(body?.message || `GitHub HTTP ${response.status}`); e.status = response.status; e.body = body; throw e; }
      return body;
    } catch (error) { if (error?.status) throw error; const mapped = classifyGithubError(error); error.github = mapped; throw error; }
    finally { clearTimeout(timer); }
  } };
}

export const githubOperationPolicy = operationPolicy;
export const githubHealthStatus = healthStatus;
