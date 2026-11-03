import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramCommandCenter } from '../telegram-command-center.js';
import { classifyTelegramMessage, createTelegramConversationMemory } from '../telegram-conversation.js';

const update = (text, id = 42, updateId = 1) => ({ update_id: updateId, message: { text, from: { id }, chat: { id, type: 'private' } } });

test('Telegram classifier keeps project discussion separate from action requests', () => {
  assert.equal(classifyTelegramMessage('Menurutmu kantor AI kita sudah pintar?').intent, 'DEEP_DISCUSSION');
  assert.equal(classifyTelegramMessage('Bahas proyek p1 dulu').intent, 'PROJECT_DISCUSSION');
  assert.equal(classifyTelegramMessage('Buatkan website klinik').intent, 'ACTION_REQUEST');
  assert.equal(classifyTelegramMessage('Saya ingin membuat website klinik').intent, 'ACTION_REQUEST');
  assert.equal(classifyTelegramMessage('Lagi ngapain?').intent, 'QUESTION');
});

test('conversation memory is bounded, isolated, and clearable', async () => {
  let saved = { conversations: {} };
  const memory = createTelegramConversationMemory({ read: async () => saved, write: async value => { saved = value; }, maxMessages: 4 });
  await memory.append('a', { role: 'user', content: 'satu' });
  await memory.append('a', { role: 'assistant', content: 'dua' });
  await memory.append('a', { role: 'user', content: 'tiga' });
  await memory.append('a', { role: 'assistant', content: 'empat' });
  await memory.append('a', { role: 'user', content: 'lima' });
  assert.deepEqual((await memory.get('a')).map(item => item.content), ['dua', 'tiga', 'empat', 'lima']);
  assert.match(await memory.getSummary('a'), /satu/);
  assert.deepEqual((await memory.context('a')).messages.map(item => item.content), ['dua', 'tiga', 'empat', 'lima']);
  await memory.setLongTerm('a', ['Preferensi bahasa Indonesia']);
  assert.deepEqual(await memory.getLongTerm('a'), ['Preferensi bahasa Indonesia']);
  assert.deepEqual(await memory.get('b'), []);
  await memory.clear('a');
  assert.deepEqual(await memory.get('a'), []);
});

test('ordinary Telegram conversation never creates a project and preserves follow-up context', async () => {
  const sent = [], creates = [], seen = [];
  const connector = { type: 'telegram', token: 'token', enabled: true, telegramOwnerUserId: '42', telegramChatId: '42' };
  const office = { snapshot: async () => ({ projects: [] }), create: async value => { creates.push(value); return { id: 'p1' }; } };
  const memory = createTelegramConversationMemory({ read: async () => ({ conversations: {} }), write: async () => {} });
  const center = createTelegramCommandCenter({
    getConnector: () => connector, bindChat: async () => {}, sendText: async (...args) => sent.push(args), office, conversationMemory: memory,
    answerConversation: async ({ history, text, intent }) => { seen.push({ history, text, intent }); return history.length ? 'Kita lanjutkan pembahasan tadi.' : 'Aku sedang standby.'; },
  });
  await center.handle('tg', update('Lagi ngapain?', 42, 1));
  await center.handle('tg', update('Bahas proyek p1 dulu', 42, 2));
  await center.handle('tg', update('Aku sedang diskusi soal ubah proyek p1', 42, 9));
  assert.equal(creates.length, 0);
  assert.equal(seen[0].intent, 'QUESTION');
  assert.equal(seen[1].intent, 'PROJECT_DISCUSSION');
  assert.equal(seen[1].history.length, 2);
  assert.match(sent.at(-1)[2], /lanjutkan/i);
});

test('explicit Telegram action still creates a project', async () => {
  const sent = [], creates = [];
  const connector = { type: 'telegram', token: 'token', enabled: true, telegramOwnerUserId: '42', telegramChatId: '42' };
  const office = { snapshot: async () => ({ projects: [] }), create: async value => { creates.push(value); return { id: 'p1' }; } };
  const center = createTelegramCommandCenter({ getConnector: () => connector, bindChat: async () => {}, sendText: async (...args) => sent.push(args), office });
  await center.handle('tg', update('Buatkan website klinik', 42, 3));
  assert.equal(creates.length, 1);
  assert.match(sent[0][2], /Perintah diterima/);
});

test('memory commands expose and delete only the current Telegram conversation', async () => {
  const sent = [];
  const connector = { type: 'telegram', token: 'token', enabled: true, telegramOwnerUserId: '42', telegramChatId: '42' };
  const memory = createTelegramConversationMemory({ read: async () => ({ conversations: {} }), write: async () => {} });
  const center = createTelegramCommandCenter({ getConnector: () => connector, bindChat: async () => {}, sendText: async (...args) => sent.push(args), office: { snapshot: async () => ({ projects: [] }) }, conversationMemory: memory, answerConversation: async () => 'jawaban' });
  await center.handle('tg', update('Halo', 42, 4));
  await center.handle('tg', update('/memory', 42, 5));
  assert.match(sent.at(-1)[2], /menyimpan 1 pertukaran/);
  await center.handle('tg', update('/forget_memory', 42, 6));
  await center.handle('tg', update('/memory', 42, 7));
  assert.match(sent.at(-1)[2], /Belum ada memori/);
});

test('explicit long-term memory is user controlled', async () => {
  const sent = [];
  const connector = { type: 'telegram', token: 'token', enabled: true, telegramOwnerUserId: '42', telegramChatId: '42' };
  const memory = createTelegramConversationMemory({ read: async () => ({ conversations: {} }), write: async () => {} });
  const center = createTelegramCommandCenter({ getConnector: () => connector, bindChat: async () => {}, sendText: async (...args) => sent.push(args), office: { snapshot: async () => ({ projects: [] }) }, conversationMemory: memory });
  await center.handle('tg', update('/remember Bahasa pilihan saya adalah Indonesia', 42, 8));
  assert.match(sent.at(-1)[2], /disimpan/);
  const context = await memory.context('tg:42:42');
  assert.deepEqual(context.longTerm, ['Bahasa pilihan saya adalah Indonesia']);
});

