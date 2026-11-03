import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWebDocument } from '../web-ingestion.js';

const response = (body, status = 200, type = 'text/html') => ({ ok: status >= 200 && status < 300, status, headers: { get: key => key === 'content-type' ? type : null }, text: async () => body });

test('web ingestion rejects missing or private URLs', async () => {
  await assert.rejects(() => fetchWebDocument({}), /URL tidak valid/);
  await assert.rejects(() => fetchWebDocument({ url: 'http://127.0.0.1/x' }), /HTTPS publik/);
});

test('plain text keeps generic code and Unicode byte limits are enforced', async () => {
  const plain = async url => String(url).endsWith('/robots.txt') ? response('') : response('function id<T>(x: T): T { return x; }', 200, 'text/plain');
  assert.match((await fetchWebDocument({ url: 'https://example.com/code' }, { fetcher: plain })).content, /id<T>/);
  const multibyte = async url => String(url).endsWith('/robots.txt') ? response('') : response('界'.repeat(4), 200, 'text/plain');
  await assert.rejects(fetchWebDocument({ url: 'https://example.com/code' }, { fetcher: multibyte, maxBytes: 6 }), /terlalu besar/);
});

test('web ingestion enforces robots and preserves provenance', async () => {
  const fetcher = async url => String(url).endsWith('/robots.txt') ? response('User-agent: *\nDisallow: /private') : response('<html><script>x</script><p>Hello&nbsp;world</p></html>');
  const result = await fetchWebDocument({ url: 'https://example.com/public' }, { fetcher });
  assert.equal(result.content, 'Hello world');
  assert.equal(result.source.uri, 'https://example.com/public');
  const blocked = () => fetchWebDocument({ url: 'https://example.com/private/a' }, { fetcher });
  await assert.rejects(blocked, /robots/);
});

test('web ingestion rejects non text and oversized sources', async () => {
  const binary = async url => String(url).endsWith('/robots.txt') ? response('') : response('x', 200, 'application/pdf');
  await assert.rejects(() => fetchWebDocument({ url: 'https://example.com/a' }, { fetcher: binary }), /Tipe konten/);
  const large = async url => String(url).endsWith('/robots.txt') ? response('') : response('123456789');
  await assert.rejects(() => fetchWebDocument({ url: 'https://example.com/a' }, { fetcher: large, maxBytes: 4 }), /terlalu besar/);
});
