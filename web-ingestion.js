import { URL } from 'node:url';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

const MAX_BYTES = 1_000_000;
const MAX_TEXT = 100_000;
const PRIVATE = /^(localhost|127\.|0\.0\.0\.0|::1|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;
const publicAddress = address => {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 0 || b === 2 || b === 168)) && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) && !(a === 203 && b === 0 && c === 113);
};

// Pin the validated address to this request; never follow a redirect or repeat DNS lookup.
async function publicFetch(value, { timeoutMs, maxBytes }) {
  const url = safeUrl(value);
  const deadline = Date.now() + timeoutMs;
  let dnsTimer;
  const addresses = await Promise.race([dns.lookup(url.hostname, { all: true }), new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('DNS melebihi batas waktu.')), timeoutMs); })]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Host harus mengarah ke IPv4 publik.');
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    let timer;
    const done = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
    const request = (url.protocol === 'https:' ? https : http).get(url, { headers: { 'user-agent': 'KantorAI-Ingestion/1.0', accept: 'text/html,text/plain' }, lookup: (_hostname, options, callback) => options?.all ? callback(null, [selected]) : callback(null, selected.address, selected.family) }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) response.destroy(new Error('Sumber terlalu besar.')); else chunks.push(chunk); });
      response.on('error', error => done(error));
      response.on('end', () => done(null, { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, headers: { get: key => response.headers[key] || null }, text: async () => Buffer.concat(chunks).toString('utf8') }));
    });
    timer = setTimeout(() => request.destroy(new Error('Sumber melebihi batas waktu.')), Math.max(1, deadline - Date.now()));
    request.on('error', error => done(error));
  });
}

export function evaluateIngestion(result) {
  const checks = [
    ['content_present', typeof result?.content === 'string' && !!result.content.trim()],
    ['content_bounded', typeof result?.content === 'string' && result.content.length <= MAX_TEXT],
    ['source_label', typeof result?.source?.label === 'string' && result.source.label.length > 0],
    ['source_uri', typeof result?.source?.uri === 'string' && /^https?:\/\//i.test(result.source.uri)],
    ['source_host', typeof result?.source?.host === 'string' && !!result.source.host],
    ['fetched_at', typeof result?.fetchedAt === 'string' && !Number.isNaN(Date.parse(result.fetchedAt))],
    ['sha256', typeof result?.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(result.sha256)],
    ['source_sha256_match', result?.source?.sha256 === result?.sha256],
    ['complete_capture', result?.truncated === false],
    ['source_host_matches_uri', (() => { try { return new URL(result.source.uri).hostname === result.source.host; } catch { return false; } })()],
  ];
  const applicable = checks.filter(([, v]) => v !== null);
  const passed = applicable.filter(([, v]) => v === true).length;
  return { label: 'ingestion_quality', passed, applicable: applicable.length, total: 10, score: passed === applicable.length ? 10 : Number((passed / applicable.length * 10).toFixed(2)), grade: passed === applicable.length ? '10/10' : `${passed}/${applicable.length}`, checks: checks.map(([name, v]) => ({ name, passed: v === true, applicable: v !== null })), factualAccuracyEvaluated: false };
}

function safeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL tidak valid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || PRIVATE.test(url.hostname) || (url.port && url.port !== '443')) throw new Error('URL HTTPS publik diperlukan.');
  url.hash = '';
  return url;
}

function allowedByRobots(text, target) {
  // Conservative policy: any declared Disallow applies. Allow exceptions and
  // user-agent precedence never broaden access beyond a published restriction.
  for (const line of String(text).split(/\r?\n/)) {
    const value = line.replace(/#.*$/, '').trim();
    const match = value.match(/^disallow\s*:\s*(.*)$/i);
    if (match && match[1]) {
      const rule = match[1].trim();
      const anchored = rule.endsWith('$');
      const pattern = (anchored ? rule.slice(0, -1) : rule).split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      const path = `${target.pathname}${target.search}`;
      if (new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path)) return false;
    }
  }
  return true;
}

export async function fetchWebDocument(input, { fetcher, maxBytes = MAX_BYTES, timeoutMs = 10000 } = {}) {
  maxBytes = Math.min(MAX_BYTES, Math.max(1, Number(maxBytes) || MAX_BYTES));
  timeoutMs = Math.min(10000, Math.max(1, Number(timeoutMs) || 10000));
  const target = safeUrl(input?.url);
  const fetchText = fetcher || ((url) => publicFetch(url, { maxBytes, timeoutMs }));
  const origin = `${target.protocol}//${target.host}`;
  const robotsResponse = await fetchText(`${origin}/robots.txt`, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!robotsResponse.ok && robotsResponse.status !== 404) throw new Error('robots.txt tidak dapat diverifikasi.');
  if (robotsResponse.ok && !allowedByRobots(await robotsResponse.text(), target)) throw new Error('Akses ditolak robots.txt.');
  const response = await fetchText(target.href, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'text/html,text/plain,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`Sumber mengembalikan HTTP ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/(html|plain)|application\/xhtml\+xml/i.test(type)) throw new Error('Tipe konten bukan teks.');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error('Sumber terlalu besar.');
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('Sumber terlalu besar.');
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(type);
  const clean = raw.replace(/<!--[^]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|footer)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ');
  const main = clean.match(/<main\b[^>]*>([^]*?)<\/main>/i)?.[1] || clean.match(/<article\b[^>]*>([^]*?)<\/article>/i)?.[1] || clean;
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decode = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key) => { if (key[0] !== '#') return entities[key.toLowerCase()] || entity; const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)); return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : entity; });
  const extracted = (isHtml ? decode(main.replace(/<\/(?:p|div|h[1-6]|li|pre|section|tr)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ')) : raw).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const content = extracted.slice(0, MAX_TEXT);
  if (!content) throw new Error('Sumber tidak berisi teks.');
  const fetchedAt = new Date().toISOString();
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const truncated = extracted.length > MAX_TEXT;
  return { content, source: { label: target.hostname, uri: target.href, host: target.hostname, fetchedAt, sha256, truncated }, fetchedAt, sha256, truncated };
}
