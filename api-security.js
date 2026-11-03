import { randomBytes, timingSafeEqual } from 'node:crypto';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createApiSecurity({ port, dev = false, apiToken = process.env.API_TOKEN, scriptHashes = [] } = {}) {
  const origins = new Set([...LOCAL_HOSTS].map(host => `http://${host}:${port}`));
  if (dev) for (const host of LOCAL_HOSTS) origins.add(`http://${host}:5173`);
  for (const raw of (process.env.API_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)) {
    try {
      const url = new URL(raw);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origins.add(url.origin);
    } catch { /* Ignore malformed deployment configuration. */ }
  }
  const sessions = new Map();
  const rate = new Map();
  let globalRate = { count: 0, reset: 0 };
  const lifetime = 12 * 60 * 60 * 1000;
  const validOrigin = origin => origins.has(origin);
  const scripts = ["'self'", ...(dev ? ["'unsafe-inline'"] : []), ...scriptHashes.filter(hash => /^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash))].join(' ');
  const connections = ["'self'", ...(dev ? [...LOCAL_HOSTS].map(host => `ws://${host}:5173`) : [])].join(' ');
  const contentPolicy = `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob:; connect-src ${connections}; script-src ${scripts}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:`;
  const cookieValue = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('harmes_session='))?.slice('harmes_session='.length);
  const validHost = raw => {
    if(typeof raw!=='string')return false;
    const normalized = raw.toLowerCase().trim();
    const configured = (process.env.API_ALLOWED_HOSTS || '').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
    return [...LOCAL_HOSTS].some(host=>normalized===`${host}:${port}`) || configured.includes(normalized);
  };
  function middleware(req, res, next) {
    if (!validHost(req.headers.host)) return res.status(403).json({ error: 'Host tidak diizinkan.' });
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    // Keep the local UI from loading active content or media from arbitrary
    // origins. Only known inline office/importmap scripts receive hashes;
    // connector requests run on the server, never in the browser.
    res.set('Content-Security-Policy', contentPolicy);
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.set('Cross-Origin-Resource-Policy', 'same-origin');
    res.set('X-Permitted-Cross-Domain-Policies', 'none');
    const origin = req.headers.origin;
    if (origin && !validOrigin(origin)) return res.status(403).json({ error: 'Permintaan dari origin ini ditolak.' });
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,X-Harmes-Bootstrap,Authorization');
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    if (!req.path.startsWith('/api/')) return next();
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.path === '/api/health' || req.path === '/api/integrations/github/callback' || req.path === '/api/github/app/callback') return next();
    const at = Date.now();
    for (const [key, value] of sessions) if (value.expires < at) sessions.delete(key);
    if (req.path === '/api/session' && req.method === 'GET') {
      if (!origin && req.headers['sec-fetch-site'] !== 'same-origin' && req.headers['x-harmes-bootstrap'] !== '1') return res.status(403).json({ error: 'Buka sesi dari aplikasi Kantor AI.' });
      let sessionId = cookieValue(req), session = sessions.get(sessionId);
      if (!session) {
        if (sessions.size >= 100) return res.status(429).json({ error: 'Terlalu banyak sesi. Coba kembali nanti.' });
        sessionId = randomBytes(32).toString('hex');
        session = { csrfToken: randomBytes(32).toString('hex'), expires: at + lifetime };
        sessions.set(sessionId, session);
      }
      session.expires = at + lifetime;
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.set('Set-Cookie', `harmes_session=${sessionId}; HttpOnly; SameSite=Strict;${secure?' Secure;':''} Path=/; Max-Age=${lifetime / 1000}`);
      return res.json({ csrfToken: session.csrfToken });
    }
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const tokenAuthorized = Boolean(apiToken && equal(bearer, apiToken));
    const sessionId = cookieValue(req), session = sessions.get(sessionId);
    if (!tokenAuthorized && !session) return res.status(401).json({ error: 'Sesi berakhir. Muat ulang aplikasi.' });
    if (!tokenAuthorized && !['GET', 'HEAD'].includes(req.method) && !equal(req.headers['x-csrf-token'], session.csrfToken)) return res.status(403).json({ error: 'Token keamanan tidak valid. Muat ulang aplikasi.' });
    if (session) session.expires = at + lifetime;
    req.sessionId = tokenAuthorized ? 'api-token' : sessionId;
    // Cap expensive operations without limiting normal polling.
    if (!['GET', 'HEAD'].includes(req.method)) {
      if(globalRate.reset<at)globalRate={count:0,reset:at+60_000};
      globalRate.count++;
      if(globalRate.count>240){res.set('Retry-After','60');return res.status(429).json({error:'Batas permintaan aplikasi tercapai. Tunggu sebentar.'});}
      for (const [key, item] of rate) if (item.reset < at) rate.delete(key);
      const key = req.sessionId;
      const item = rate.get(key) || { count: 0, reset: at + 60_000 };
      item.count++; rate.set(key, item);
      if (item.count > 120) { res.set('Retry-After', String(Math.max(1, Math.ceil((item.reset - at) / 1000)))); return res.status(429).json({ error: 'Terlalu banyak permintaan. Tunggu sebentar.' }); }
    }
    next();
  }
  return { middleware, validOrigin, validHost };
}

export function providerUrlAllowed(raw, provider) {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || raw.length > 500) return false;
    if (provider === 'ollama') return LOCAL_HOSTS.has(url.hostname) && ['http:', 'https:'].includes(url.protocol);
    if (provider === '9router') return LOCAL_HOSTS.has(url.hostname) && ['http:', 'https:'].includes(url.protocol) && url.pathname.replace(/\/$/, '') === '/v1';
    if (provider !== 'openai-compatible') return false;
    const allowed = new Set(['api.openai.com', 'openrouter.ai', ...(process.env.AI_ALLOWED_HOSTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)]);
    // Loopback compatibility endpoints are explicitly opt-in, useful for local gateways and offline tests.
    if (LOCAL_HOSTS.has(url.hostname)) return process.env.AI_ALLOW_LOCAL_COMPATIBLE === '1' && ['http:', 'https:'].includes(url.protocol);
    return url.protocol === 'https:' && (!url.port || url.port === '443') && allowed.has(url.hostname);
  } catch { return false; }
}
