import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramCommandCenter, normalizeTelegramOwnerUserId } from '../telegram-command-center.js';

function setup(overrides = {}) {
  const connector = { type: 'telegram', token: 'isolated-token', enabled: true, telegramOwnerUserId: '42', telegramChatId: '42', ...overrides };
  const sent = [], controls = [], projects = [], creates = [];
  const office = { snapshot: async () => ({ projects, commands: [] }), create: async input => { creates.push(input); let p = projects.find(p => p.sourceId === input.sourceId); if (!p) { p = { id: `p${projects.length + 1}`, status: 'queued', ...input }; projects.push(p); } return p; }, control: async (...args) => controls.push(args) };
  const center = createTelegramCommandCenter({ getConnector: () => connector, bindChat: async (_id, chatId) => { connector.telegramChatId = chatId; }, sendText: async (...args) => sent.push(args), office });
  return { center, connector, sent, controls, projects, creates, office };
}
const update = (text = 'Buat proyek', extra = {}) => ({ update_id: 7, message: { text, from: { id: 42 }, chat: { id: 42, type: 'private' }, ...extra } });

test('owner authentication rejects unauthorized private users and group chats', async () => {
  const x = setup(); await x.center.handle('tg', update('Buat proyek', { from: { id: 5 } })); await x.center.handle('tg', update('/start', { chat: { id: -10, type: 'group' } }));
  assert.equal(x.projects.length, 0); assert.equal(x.controls.length, 0);
});
test('only configured owner can bind an unbound private chat', async () => {
  const x = setup({ telegramChatId: '' }); await x.center.handle('tg', update('/start', { from: { id: 5 } })); assert.equal(x.connector.telegramChatId, ''); await x.center.handle('tg', update('/start')); assert.equal(x.connector.telegramChatId, '42');
});

test('configured owner first ordinary message binds an unbound chat', async () => {
  const x = setup({ telegramChatId: '' });
  await x.center.handle('tg', update('Halo Arya'));
  assert.equal(x.connector.telegramChatId, '42');
  assert.match(String(x.sent[0]?.[2]), /terhubung/i);
});
test('natural text awaits durable project creation and duplicate source is idempotent', async () => {
  const x = setup(); await x.center.handle('tg', update()); await x.center.handle('tg', update()); assert.equal(x.projects.length, 1); assert.equal(x.creates.length, 2); assert.equal(x.creates[0].sourceId, 'tg:7'); assert.equal(x.creates[0].source, 'telegram');
});
test('creation failure can retry same update and outbound failure propagates', async () => {
  const x = setup(); const original = x.office.create; let failed = false; x.office.create = async input => { if (!failed) { failed = true; throw new Error('storage unavailable'); } return original(input); }; await assert.rejects(x.center.handle('tg', update()), /storage unavailable/); await x.center.handle('tg', update()); assert.equal(x.projects.length, 1);
});
test('controls and status only use office contract; unsupported media is truthful', async () => {
  const x = setup(); await x.center.handle('tg', update('/approve p1')); assert.deepEqual(x.controls, [['p1', 'approve', undefined]]); await x.center.handle('tg', update(undefined, { text: undefined, photo: [{}] })); assert.match(x.sent.at(-1)[2], /hanya.*teks/); await x.center.handle('tg', update('/unknown')); assert.match(x.sent.at(-1)[2], /help/);
});
test('owner IDs reject missing and malformed values', () => { assert.equal(normalizeTelegramOwnerUserId('42'), '42'); assert.equal(normalizeTelegramOwnerUserId(null), ''); assert.equal(normalizeTelegramOwnerUserId('-42'), ''); });
test('operational Telegram commands report real office state and continue one candidate', async () => { const x=setup(); x.office.snapshot=async()=>({projects:[{id:'p1',status:'paused',instruction:'website klien'}],commands:[],meetings:[],metrics:{totalProjects:1,activeProjects:0,completedProjects:0,failedProjects:0,waitingApproval:0,tokens:12},capabilities:{agents:[{agentId:'developer',role:'Developer',readiness:'ready',model:'test'}]}}); await x.center.handle('tg',update('/projects')); assert.match(x.sent.at(-1)[2],/p1/); await x.center.handle('tg',update('/employees')); assert.match(x.sent.at(-1)[2],/developer/); await x.center.handle('tg',update('/report')); assert.match(x.sent.at(-1)[2],/12 token/); await x.center.handle('tg',update('/continue p1')); assert.deepEqual(x.controls.at(-1).slice(0,2),['p1','resume']); });
test('callback query uses owner authentication and real command handler', async () => { const x=setup(); await x.center.handle('tg',{update_id:8,callback_query:{id:'cb',data:'projects',from:{id:42},message:{chat:{id:42,type:'private'}}}}); assert.match(x.sent.at(-1)[2],/Belum ada proyek/); });
test('status sends real Telegram action buttons and answers callback queries', async () => {
  const x=setup(); const answered=[];
  const center=createTelegramCommandCenter({getConnector:()=>x.connector,bindChat:async()=>{},sendText:async(...args)=>x.sent.push(args),answerCallback:async(...args)=>answered.push(args),office:{snapshot:async()=>({projects:[{id:'p1',status:'waiting_approval',instruction:'website'}],commands:[],meetings:[]})}});
  await center.handle('tg',{update_id:9,callback_query:{id:'cb9',data:'status p1',from:{id:42},message:{chat:{id:42,type:'private'}}}});
  assert.equal(answered.length,1); assert.equal(answered[0][1],'cb9'); assert.ok(x.sent.at(-1)[3].inline_keyboard.flat().some(button=>button.callback_data==='approve p1'));
});

test('Stage6 Indonesian command aliases map to safe read and review actions', async () => {
  const x = setup();
  x.office.snapshot = async () => ({ projects: [{ id: 'p1', status: 'waiting_approval', instruction: 'web' }], commands: [], meetings: [], metrics: {}, capabilities: { agents: [] } });
  for (const [alias, expected] of [['/proyek', /p1/], ['/progres p1', /p1/], ['/kantor', /Laporan kantor/], ['/karyawan', /Data karyawan/], ['/tugas', /Belum ada tugas/], ['/laporan', /Laporan kantor/], ['/publikasi', /belum terhubung/i]]) {
    await x.center.handle('tg', update(alias));
    assert.match(String(x.sent.at(-1)[2]), expected, alias);
  }
  await x.center.handle('tg', update('/revisi p1 perbaiki CTA'));
  assert.deepEqual(x.controls.at(-1).slice(0, 3), ['p1', 'revise', 'perbaiki CTA']);
  await x.center.handle('tg', update('/batal p1'));
  assert.deepEqual(x.controls.at(-1).slice(0, 2), ['p1', 'cancel']);
});

test('natural Indonesian review intent requires an unambiguous project ID', async () => {
  const x = setup();
  await x.center.handle('tg', update('setujui proyek p1'));
  assert.deepEqual(x.controls.at(-1), ['p1', 'approve', undefined]);
  await x.center.handle('tg', update('tolong setujui proyek'));
  assert.equal(x.controls.length, 1);
  assert.match(String(x.sent.at(-1)[2]), /ambigu/i);
});

test('setuju spelling maps to approval instead of creating a project', async () => {
  const x = setup(); await x.center.handle('tg', update('Setuju proyek p123'));
  assert.equal(x.creates.length, 0); assert.deepEqual(x.controls.at(-1), ['p123', 'approve', undefined]);
});

test('long owner development directive becomes a background project request', async () => {
  const x = setup();
  const brief = 'ARYA, mulai sekarang bentuk Tim Pengembangan Internal Kantor AI. Adakan meeting berkala dengan programmer, system architect, UI UX designer, debugger, QA, cybersecurity, dan karyawan terkait. Evaluasi seluruh sistem, temukan bug, fitur kurang, chatbot lambat, tampilan, serta peluang pengembangan. Prioritaskan kecepatan Telegram, coding mandiri, kualitas meeting, koordinasi, dan integrasi GitHub. Setiap perubahan diuji di branch pengembangan dan tidak boleh merge atau deploy tanpa persetujuan saya. Simpan hasil dan buat daftar prioritas perbaikan.';
  await x.center.handle('tg', update(brief));
  assert.equal(x.creates.length, 1);
  assert.equal(x.sent[0][2], 'Siap, Arya. Perintah diterima. Saya sedang menyiapkan proyek dan tim yang diperlukan.');
});

test('Stage11 self-development commands create and inspect real proposals', async () => {
  const x = setup(); const proposals = [{ id: 'p-maint', status: 'validated', changedFiles: ['app.js'], diffHash: 'abc', checks: [{ name: 'tests', passed: true, code: 0 }] }];
  x.center = createTelegramCommandCenter({ getConnector: () => x.connector, bindChat: async () => {}, sendText: async (...args) => x.sent.push(args), office: x.office, getSelfDevelopment: () => ({ create: async input => ({ id: 'p-new', status: 'proposed', ...input }), snapshot: async () => ({ proposals }), rollback: async () => ({ id: 'p-maint', status: 'rolled_back', rollbackCommit: 'r1' }) }) });
  await x.center.handle('tg', update('/perbaiki_kantor')); assert.match(x.sent.at(-1)[2], /p-new/);
  await x.center.handle('tg', update('/hasil_testing p-maint')); assert.match(x.sent.at(-1)[2], /LULUS/);
  await x.center.handle('tg', update('/lihat_perubahan p-maint')); assert.match(x.sent.at(-1)[2], /app\.js/);
  await x.center.handle('tg', update('/rollback p-maint setujui')); assert.match(x.sent.at(-1)[2], /Rollback selesai/);
});

test('complex instructions acknowledge before slow durable worker enqueue', async () => {
  const x = setup(); let release;
  x.office.create = () => new Promise(resolve => { release = () => resolve({ id: 'p-slow' }); });
  const pending = x.center.handle('tg', update('ARYA, buatkan website klien.'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(String(x.sent[0]?.[2]), /^Siap, Arya\. Perintah diterima\./);
  release(); await pending;
  assert.match(String(x.sent.at(-1)?.[2]), /p-slow/);
});

test('greetings use fast path without creating a project', async () => {
  const x = setup(); await x.center.handle('tg', update('Halo Arya'));
  assert.equal(x.creates.length, 0); assert.match(String(x.sent.at(-1)?.[2]), /siap membantu/i);
});

test('common Hallo spelling uses fast path', async () => {
  const x = setup(); await x.center.handle('tg', update('Hallo'));
  assert.equal(x.creates.length, 0); assert.match(String(x.sent.at(-1)?.[2]), /siap membantu/i);
});

test('emoji-only reaction does not create a project', async () => {
  const x = setup(); await x.center.handle('tg', update('❤️'));
  assert.equal(x.creates.length, 0); assert.equal(x.sent.length, 0);
});

test('stop_all invokes durable emergency control and reports external-action boundary', async () => {
  const x = setup(); let stopped;
  x.office.stopAll = async (...args) => { stopped = args; return { active: true, stopped: ['p1'] }; };
  await x.center.handle('tg', update('/stop_all'));
  assert.deepEqual(stopped, ['Perintah Telegram pemilik', 'tg:7']);
  assert.match(String(x.sent.at(-1)?.[2]), /Emergency stop aktif/);
  assert.match(String(x.sent.at(-1)?.[2]), /Tidak ada klaim pekerjaan eksternal dibatalkan/);
});

test('natural Indonesian emergency stop maps to the same backend control', async () => {
  const x = setup(); let calls = 0;
  x.office.stopAll = async () => { calls += 1; return { active: true, stopped: [] }; };
  await x.center.handle('tg', update('ARYA, hentikan semua pekerjaan sekarang'));
  assert.equal(calls, 1);
  assert.match(String(x.sent.at(-1)?.[2]), /Emergency stop aktif/);
});
