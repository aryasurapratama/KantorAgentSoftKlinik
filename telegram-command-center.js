import { classifyTelegramMessage } from './telegram-conversation.js';

const COMMANDS = new Set(['status','pause','resume','cancel','approve','reject','revise','retry','help','start','projects','employees','tasks','meeting','evaluate','report','details','continue','publishing','knowledge','sop','memory','remember','forget_memory','perbaiki_kantor','optimasi_kantor','update_kantor','tambah_fitur','audit_kode','cek_error','cek_performa','hasil_testing','lihat_perubahan','rollback','stop_all']);
const COMMAND_ALIASES = Object.freeze({
  kantor: 'report', karyawan: 'employees', proyek: 'projects', meeting: 'meeting',
  tugas: 'tasks', progres: 'status', laporan: 'report', konten: 'projects',
  publikasi: 'publishing', approve: 'approve', revisi: 'revise', batal: 'cancel', pengetahuan: 'knowledge', basispengetahuan: 'knowledge', prosedur: 'sop', ingat: 'remember',
  perbaiki_kantor: 'perbaiki_kantor', optimasi_kantor: 'optimasi_kantor', update_kantor: 'update_kantor', tambah_fitur: 'tambah_fitur', audit_kode: 'audit_kode', cek_error: 'cek_error', cek_performa: 'cek_performa', hasil_testing: 'hasil_testing', lihat_perubahan: 'lihat_perubahan', rollback: 'rollback', hentikan: 'stop_all', stop_all: 'stop_all', forget: 'forget_memory', hapus_memori: 'forget_memory'
});

export function normalizeTelegramOwnerUserId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value))) return value;
  return '';
}

function textOf(update) { if (typeof update?.message?.text === 'string') return update.message.text.trim(); if (typeof update?.callback_query?.data === 'string') return '/' + update.callback_query.data.trim(); return ''; }
function messageOf(update) { return update?.message || update?.callback_query?.message; }
function idOf(value) { return value === undefined || value === null ? '' : String(value); }
function commandOf(text) {
  const m = text.match(/^\/(\w+)(?:@[^\s]+)?(?:\s+([\s\S]*))?$/i);
  return m ? { name: m[1].toLowerCase(), args: (m[2] || '').trim() } : null;
}
function canonicalCommand(parsed) {
  if (!parsed) return parsed;
  return { ...parsed, name: COMMAND_ALIASES[parsed.name] || parsed.name };
}
function naturalIntent(text) {
  const value = String(text || '').trim();
  const lower = value.toLocaleLowerCase('id-ID');
  const discussion = /\b(?:menurutmu|menurut kamu|apa pendapatmu|bagaimana menurutmu|apakah|kenapa|mengapa|kalau|jika|bahas|diskusi|brainstorm|analisis)\b/i.test(value);
  if (!value || /^(buat|bikin|buatkan|susun|rancang|kerjakan|tolong buat)\b/i.test(value)) return null;
  const idPattern = '(?:p\\d[\\w-]*|[0-9a-f]{8}-[0-9a-f-]{27,})';
  const idMatch = lower.match(new RegExp('\\bproyek\\s+(' + idPattern + ')\\b', 'i')) || lower.match(new RegExp('\\b(' + idPattern + ')\\b', 'i'));
  const id = idMatch?.[1] || '';
  const trailing = idMatch ? value.slice((idMatch.index || 0) + idMatch[0].length).replace(/^[\s:,-]+/, '') : '';
  const idArgs = id ? id + (trailing ? ' ' + trailing : '') : '';
  // Long owner directives are work requests. Do not let words such as
  // "meeting", "tugas", or "proses" turn a development brief into a
  // read-only command or an ambiguity response.
  if (value.length >= 240 && /\b(arya|mulai|jalankan|adakan|bentuk|evaluasi|audit|prioritaskan|perintahkan|kembangkan|simpan|targetkan)\b/i.test(value)) return null;
  if (!discussion && /\b(hentikan\s+semua|stop\s+all|matikan\s+semua\s+pekerjaan)\b/.test(lower)) return { name: 'stop_all', args: '', natural: true };
  if (!discussion && /\b(cek|periksa|lihat)\s+(error|kesalahan)\b/.test(lower)) return { name: 'cek_error', args: id, natural: true };
  if (!discussion && /\b(cek|periksa|lihat)\s+performa\b/.test(lower)) return { name: 'cek_performa', args: id, natural: true };
  if (!discussion && /\b(hasil|laporan)\s+(testing|pengujian)\b/.test(lower)) return { name: 'hasil_testing', args: id, natural: true };
  if (!discussion && /\b(lihat|tampilkan|cek)\s+perubahan\b/.test(lower)) return { name: 'lihat_perubahan', args: id, natural: true };
  if (!discussion && /\b(perbaiki|perbaikan)\b.*\bkantor\b/.test(lower)) return { name: 'perbaiki_kantor', args: '', natural: true };
  if (!discussion && /\b(optimasi|optimalkan)\b.*\bkantor\b/.test(lower)) return { name: 'optimasi_kantor', args: '', natural: true };
  if (!discussion && /\b(update|perbarui|pembaruan)\b.*\bkantor\b/.test(lower)) return { name: 'update_kantor', args: '', natural: true };
  if (!discussion && /\b(tambah|tambahkan|rancang)\b.*\bfitur\b/.test(lower)) return { name: 'tambah_fitur', args: '', natural: true };
  if (!discussion && /\b(audit)\b.*\b(kode|kantor|sistem)\b/.test(lower)) return { name: 'audit_kode', args: '', natural: true };
  const action = lower.match(/\b(setujui|setuju|approve|sahkan)\b/) ? 'approve'
    : lower.match(/\b(minta\s+revisi|revisi|ubah)\b/) ? 'revise'
      : lower.match(/\b(batalkan|batalkanlah|batal|cancel)\b/) ? 'cancel'
        : lower.match(/\b(jeda|tunda)\b/) ? 'pause'
          : lower.match(/\b(lanjutkan|teruskan)\b/) ? 'resume'
            : lower.match(/\b(coba\s+lagi|ulang)\b/) ? 'retry' : null;
  if (action && !discussion) return { name: action, args: idArgs, natural: true };
  if (discussion) return null;
  if (/\b(?:lihat|tampilkan|cek|periksa|berapa|jumlah|ada)\b.*\b(progres|status)\b/.test(lower)) return { name: 'status', args: id, natural: true };
  if (/\b(berapa|jumlah|ada\s+berapa)\b.*\b(proyek|project)\b/.test(lower)) return { name: 'projects', args: '', natural: true };
  if (/\b(berapa|jumlah|ada\s+berapa)\b.*\b(tugas|task)\b/.test(lower)) return { name: 'tasks', args: '', natural: true };
  if (/\b(berapa|jumlah|ada\s+berapa)\b.*\b(karyawan|pegawai|tim)\b/.test(lower)) return { name: 'employees', args: '', natural: true };
  if (/^status\s+kantor\b/.test(lower)) return { name: 'report', args: '', natural: true };
  if (/\b(daftar|list|lihat|tampilkan)\b.*\b(proyek|project)\b/.test(lower)) return { name: 'projects', args: '', natural: true };
  if (/\b(daftar|list|lihat|tampilkan|berapa|jumlah)\b.*\b(karyawan|pegawai|tim)\b/.test(lower)) return { name: 'employees', args: '', natural: true };
  if (/\b(daftar|list|lihat|tampilkan|berapa|jumlah)\b.*\b(tugas|task)\b/.test(lower)) return { name: 'tasks', args: '', natural: true };
  if (/\b(daftar|list|lihat|tampilkan|jadwal|cek)\b.*\b(meeting|rapat)\b/.test(lower)) return { name: 'meeting', args: id, natural: true };
  if (/\b(daftar|list|lihat|tampilkan|buka|cek)\b.*\b(pengetahuan|knowledge|basis pengetahuan|dokumen)\b/.test(lower)) return { name: 'knowledge', args: '', natural: true };
  if (/\b(daftar|list|lihat|tampilkan|buka|cek)\b.*\b(sop|prosedur kerja)\b/.test(lower)) return { name: 'sop', args: '', natural: true };
  if (/\b(lihat|tampilkan|buatkan|kirim)\b.*\b(kantor|laporan|ringkasan)\b/.test(lower)) return { name: 'report', args: '', natural: true };
  if (/\b(daftar|list|lihat|tampilkan)\b.*\b(konten|content)\b/.test(lower)) return { name: 'projects', args: '', natural: true };
  if (/\b(lihat|tampilkan|cek|kirim|terbitkan)\b.*\b(publikasi|publish)\b/.test(lower)) return { name: 'publishing', args: '', natural: true };
  // Do not turn an underspecified operational request into a new project.
  if (/\b(proyek|project)\b/.test(lower) && /\b(tindak|proses|urus|selesaikan)\b/.test(lower)) return { ambiguous: true };
  return null;
}
function fastResponse(text) {
  const value = String(text || '').trim().toLocaleLowerCase('id-ID');
  if (/^(halo|hallo|hello|hai|hi|hey|pagi|siang|sore|malam|permisi|assalamu'?alaikum)\b/.test(value)) {
    return 'Halo! Lagi standby nih 😄 Siap membantu. Ada yang mau kita bahas?';
  }
  if (/^(terima kasih|makasih|thanks)\b/.test(value)) return 'Sama-sama, Arya.';
  if (/^(bisa bantu|apa yang bisa kamu lakukan|siapa kamu)\b/.test(value)) {
    return 'Saya Arya AI. Saya dapat memantau proyek, mengatur meeting, dan menjalankan pekerjaan melalui antrean worker.';
  }
  return '';
}
function projectId(snapshot, id) { return (snapshot?.projects || []).find(p => String(p.id) === id)?.id || id; }
function projectLabel(p) { return p?.title || p?.name || p?.id || 'proyek'; }

export function createTelegramCommandCenter({ getConnector, bindChat, sendText, answerCallback, office, sendArtifact, getKnowledge, getSelfDevelopment, answerConversation, conversationMemory } = {}) {
  if (typeof getConnector !== 'function' || typeof bindChat !== 'function' || typeof sendText !== 'function' || !office) throw new TypeError('Telegram command center dependencies are required');
  const memory = conversationMemory || (() => {
    const rows = new Map();
    return { get: async key => structuredClone(rows.get(key) || []), append: async (key, item) => rows.set(key, [...(rows.get(key) || []), item].slice(-24)), clear: async key => key ? rows.delete(key) : rows.clear(), snapshot: async key => structuredClone(rows.get(key) || []) };
  })();
  const remember = async (key, item) => { try { await memory?.append?.(key, item); } catch { /* conversation memory must not block Telegram replies */ } };
  const recall = async key => { try { return memory?.get ? await memory.get(key) : []; } catch { return []; } };
  const recallContext = async key => {
    try {
      if (typeof memory?.context === 'function') return await memory.context(key);
      return { messages: await recall(key), summary: '', longTerm: [] };
    } catch { return { messages: [], summary: '', longTerm: [] }; }
  };
  const forget = async key => { try { await memory?.clear?.(key); } catch { /* best effort; action path remains safe */ } };
  const rememberLongTerm = async (key, value) => { try { if (typeof memory?.setLongTerm !== 'function') return false; const context = await recallContext(key); await memory.setLongTerm(key, [...(context.longTerm || []), value]); return true; } catch { return false; } };
  const send = (item, chatId, text, options) => Promise.resolve(sendText(item, chatId, String(text), options));
  const projectKeyboard = p => p?.id ? { inline_keyboard: [[
    { text: 'Lihat Progres', callback_data: `status ${p.id}` },
    { text: 'Lihat Meeting', callback_data: `meeting ${p.id}` },
    { text: 'Lihat Hasil', callback_data: `report ${p.id}` }
  ], [
    { text: 'Detail', callback_data: `details ${p.id}` },
    { text: 'Minta Revisi', callback_data: `revise ${p.id}` },
    { text: 'Setujui', callback_data: `approve ${p.id}` },
    { text: 'Tolak', callback_data: `reject ${p.id}` }
  ], [
    { text: 'Tunda', callback_data: `pause ${p.id}` },
    { text: 'Lanjutkan', callback_data: `resume ${p.id}` },
    { text: 'Batalkan', callback_data: `cancel ${p.id}` }
  ]] } : undefined;
  const officeKeyboard = { inline_keyboard: [[
    { text: 'Lihat Karyawan', callback_data: 'employees' },
    { text: 'Lihat Tugas', callback_data: 'tasks' },
    { text: 'Lihat Performa', callback_data: 'evaluate' }
  ], [
    { text: 'Panggil Meeting', callback_data: 'meeting' },
    { text: 'Laporan', callback_data: 'report' }
  ], [
    { text: 'Basis Pengetahuan', callback_data: 'knowledge' },
    { text: 'SOP', callback_data: 'sop' }
  ]] };
  const auth = (id, update, allowStart = false) => {
    const item = getConnector(id); const msg = messageOf(update); const chatId = idOf(msg?.chat?.id); const userId = normalizeTelegramOwnerUserId(update?.callback_query?.from?.id ?? msg?.from?.id);
    const ownerId = normalizeTelegramOwnerUserId(item?.telegramOwnerUserId || item?.ownerUserId);
    const privateChat = msg?.chat?.type === 'private';
    if (!item || item.enabled === false || item.inboundEnabled === false || !item.token || !chatId || !privateChat || !userId || userId !== ownerId) return { ok: false, item, chatId, userId, ownerId, privateChat };
    const bound = idOf(item.telegramChatId || item.chatId);
    // The configured owner may bind the first private chat with /start or the
    // first ordinary message. This prevents a silent dead end when the owner
    // configured the bot but never issued /start.
    if (!bound) return { ok: true, item, chatId, userId, unbound: true };
    if (!bound || bound !== chatId) return { ok: false, item, chatId };
    return { ok: true, item, chatId, userId };
  };
  async function handle(id, update) {
    const sourceId = `${id}:${idOf(update?.update_id)}`;
    const text = textOf(update); const msg = messageOf(update);
    if (!msg || !text) { if (msg?.chat?.id) { const a = auth(id, update); if (a.ok) await send(a.item, a.chatId, 'Saya hanya dapat memproses pesan teks saat ini.'); } return { ignored: true }; }
    const rawParsed = commandOf(text); const parsedCommand = canonicalCommand(rawParsed); const a = auth(id, update, rawParsed?.name === 'start');
    if (!a.ok) {
      if (a.item && a.chatId && a.privateChat) {
        const detail = a.userId ? `ID pengguna Anda: ${a.userId}.` : 'ID pengguna tidak terbaca.';
        await send(a.item, a.chatId, `Akses ditolak. ${detail} Masukkan ID tersebut sebagai ID pengguna pemilik di Pengaturan → Telegram, lalu kirim /start.`);
      }
      return { unauthorized: true };
    }
    if (a.unbound) {
      await Promise.resolve(bindChat(id, a.chatId));
      await send(a.item, a.chatId, 'Chat Telegram terhubung.');
      if (rawParsed?.name === 'start') { await send(a.item, a.chatId, 'Kirim instruksi untuk memulai proyek.'); return { bound: true }; }
    }
    if (update?.callback_query?.id && typeof answerCallback === 'function') {
      try { await answerCallback(a.item, update.callback_query.id); } catch { /* answering is best effort */ }
    }
    // Emoji/reaction-only messages are not work instructions. Ignore them so
    // a heart or sticker cannot create a long-running AI project.
    if (/^[\p{Extended_Pictographic}\uFE0F\u200D\s!?.,]+$/u.test(text)) return { ignored: true, reaction: true };
    const memoryKey = `${id}:${a.chatId}:${a.userId}`;
    const classification = classifyTelegramMessage(text);
    if (parsedCommand?.name === 'memory' || parsedCommand?.name === 'remember' || parsedCommand?.name === 'forget_memory') {
      if (parsedCommand.name === 'forget_memory' || /^(hapus|clear|delete|bersihkan)\b/i.test(parsedCommand.args)) {
        await forget(memoryKey);
        await send(a.item, a.chatId, 'Memori percakapan Telegram sudah dihapus.');
      } else if (parsedCommand.name === 'remember') {
        if (typeof memory?.setLongTerm !== 'function' || !parsedCommand.args) {
          await send(a.item, a.chatId, 'Gunakan /remember informasi yang perlu saya ingat.');
        } else {
          const stored = await rememberLongTerm(memoryKey, parsedCommand.args);
          await send(a.item, a.chatId, stored ? 'Informasi itu disimpan sebagai memori jangka panjang.' : 'Memori jangka panjang belum tersedia.');
        }
      } else {
        const context = await recallContext(memoryKey);
        const history = context.messages || [];
        const longTerm = context.longTerm || [];
        if (history.length || longTerm.length) {
          const recent = history.slice(-4).map(item => `${item.role === 'user' ? 'Anda' : 'Arya'}: ${item.content}`).join('\n');
          const notes = longTerm.length ? `\nMemori jangka panjang:\n- ${longTerm.join('\n- ')}` : '';
          await send(a.item, a.chatId, `Memori percakapan menyimpan ${Math.floor(history.length / 2)} pertukaran terakhir${longTerm.length ? ` dan ${longTerm.length} catatan jangka panjang` : ''}.${notes}${recent ? `\nRiwayat terbaru:\n${recent}` : ''}`.slice(0, 3900));
        } else await send(a.item, a.chatId, 'Belum ada memori percakapan tersimpan. Gunakan /remember untuk menyimpan hal penting.');
      }
      return { ok: true, memory: true };
    }
    const quick = !parsedCommand && fastResponse(text);
    if (quick) {
      await remember(memoryKey, { role: 'user', content: text });
      await remember(memoryKey, { role: 'assistant', content: quick });
      await send(a.item, a.chatId, quick); return { ok: true, fast: true };
    }
    let parsed = parsedCommand;
    if (!parsed) {
      const intent = naturalIntent(text);
      if (intent?.ambiguous) { await send(a.item, a.chatId, 'Instruksi belum cukup spesifik. Sebutkan aksi dan ID proyek, misalnya: setujui proyek p123.'); return { ok: false, ambiguous: true }; }
      if (intent) parsed = intent;
    }
    if (parsed) {
      if (parsed.name === 'stop_all') { if (typeof office.stopAll !== 'function') { await send(a.item,a.chatId,'Emergency stop belum tersedia.'); return {ok:false}; } const result=await office.stopAll('Perintah Telegram pemilik',sourceId); await send(a.item,a.chatId,`Emergency stop aktif. ${result.stopped.length} proyek dihentikan sementara. Tidak ada klaim pekerjaan eksternal dibatalkan.`); return {ok:true,stopped:result.stopped}; }
      if (!COMMANDS.has(parsed.name)) { await send(a.item, a.chatId, 'Perintah tidak dikenali. Gunakan /help.'); return { ok: false }; }
      if (parsed.natural && ['approve', 'revise', 'cancel', 'pause', 'resume', 'retry'].includes(parsed.name) && !parsed.args) { await send(a.item, a.chatId, 'Instruksi ambigu. Sebutkan ID proyek, misalnya: setujui proyek p123.'); return { ok: false, ambiguous: true }; }
      if (parsed.name === 'start') { await send(a.item, a.chatId, 'Chat Telegram aktif. Kirim instruksi proyek.'); return { ok: true }; }
      if (parsed.name === 'help') { await send(a.item, a.chatId, '/status [ID], /details ID, /projects, /employees, /tasks, /meeting, /evaluate, /report, /knowledge, /sop, /continue [ID], /pause ID, /resume ID, /cancel ID, /approve ID, /reject ID, /revise ID alasan, /retry ID alasan, /memory, /remember teks, /forget_memory, /perbaiki_kantor, /optimasi_kantor, /update_kantor, /tambah_fitur, /audit_kode, /cek_error, /cek_performa, /hasil_testing, /lihat_perubahan, /rollback ID, /stop_all. Obrolan biasa tidak menjalankan proyek; perintah tindakan tetap memerlukan instruksi eksplisit.'); return { ok: true }; }
      const selfDev = typeof getSelfDevelopment === 'function' ? getSelfDevelopment() : null;
      if (['perbaiki_kantor','optimasi_kantor','update_kantor','tambah_fitur','audit_kode'].includes(parsed.name)) {
        if (!selfDev) { await send(a.item, a.chatId, 'Engine self-development belum siap.'); return { ok: false }; }
        const target = parsed.name.replaceAll('_kantor', '').replaceAll('_kode', '').replaceAll('_', ' ');
        const request = parsed.args || ({ perbaiki_kantor: 'Periksa error dan perbaiki Kantor AI', optimasi_kantor: 'Audit performa dan optimalkan Kantor AI', update_kantor: 'Siapkan pembaruan aman Kantor AI', tambah_fitur: 'Rancang fitur baru untuk Kantor AI', audit_kode: 'Audit kode Kantor AI' }[parsed.name]);
        try { const proposal = await selfDev.create({ request, target }); await send(a.item, a.chatId, `Proposal ${proposal.id} dibuat untuk ${target}. Jalankan validasi melalui dashboard/API; status: ${proposal.status}.`); } catch (error) { await send(a.item, a.chatId, `Proposal gagal dibuat: ${error.message}`); }
        return { ok: true };
      }
      if (['cek_performa','hasil_testing','lihat_perubahan','cek_error'].includes(parsed.name)) {
        if (!selfDev) { await send(a.item, a.chatId, 'Engine self-development belum siap.'); return { ok: false }; }
        const snapshot = await selfDev.snapshot(); const rows = snapshot.proposals || [];
        if (parsed.name === 'cek_performa') { await send(a.item, a.chatId, `Self-development: ${rows.length} proposal, ${rows.filter(x => x.status === 'validated').length} tervalidasi, ${rows.filter(x => x.status === 'applied').length} diterapkan. Bukti performa hanya dicatat setelah benchmark/test benar-benar berjalan.`); return { ok: true }; }
        const p = parsed.args ? rows.find(x => x.id === parsed.args) : rows[0];
        if (parsed.name === 'hasil_testing') { await send(a.item, a.chatId, p ? (p.checks || []).map(x => `${x.name}: ${x.passed ? 'LULUS' : 'GAGAL'} (exit ${x.code})`).join('\n') || 'Belum ada hasil testing.' : 'Proposal tidak ditemukan.'); return { ok: true }; }
        if (parsed.name === 'cek_error') { await send(a.item, a.chatId, p?.error ? `Error proposal ${p.id}: ${p.error}` : 'Tidak ada error proposal yang tercatat.'); return { ok: true }; }
        await send(a.item, a.chatId, p ? `${p.id} — ${p.status} — file: ${(p.changedFiles || []).join(', ') || 'belum ada'} — diff: ${p.diffHash || 'belum ada'}` : 'Belum ada proposal perubahan.'); return { ok: true };
      }
      if (parsed.name === 'rollback') {
        if (!selfDev || !parsed.args) { await send(a.item, a.chatId, 'Gunakan /rollback ID dan jalankan dengan persetujuan pemilik.'); return { ok: false }; }
        const approved = /\b(setujui|confirm|approved)\b/i.test(parsed.args); const id = parsed.args.split(/\s+/)[0];
        if (!approved) { await send(a.item, a.chatId, `Rollback ${id} memerlukan konfirmasi eksplisit: /rollback ${id} setujui`); return { ok: false }; }
        try { const p = await selfDev.rollback(id, { approved: true, actor: 'owner', reason: 'Perintah Telegram pemilik' }); await send(a.item, a.chatId, `Rollback selesai: ${p.id}. Commit rollback: ${p.rollbackCommit || 'tidak tersedia'}.`); } catch (error) { await send(a.item, a.chatId, `Rollback gagal: ${error.message}`); }
        return { ok: true };
      }
      if (parsed.name === 'status') { const s = await office.snapshot(); const p = parsed.args ? (s.projects || []).find(x => String(x.id) === parsed.args) : null; await send(a.item, a.chatId, p ? `Proyek ${projectLabel(p)} (${p.id}) — ${p.status || 'status tidak tersedia'}` : (s.projects || []).map(x => `${projectLabel(x)} (${x.id}) — ${x.status || 'status tidak tersedia'}`).join('\n') || 'Belum ada proyek.', p ? projectKeyboard(p) : officeKeyboard); return { ok: true }; }
      if (parsed.name === 'details') { const s = await office.snapshot(); const p = (s.projects || []).find(x => String(x.id) === parsed.args); if (!p) { await send(a.item, a.chatId, 'ID proyek tidak ditemukan.'); return { ok: false }; } const taskRows=(p.tasks||[]).slice(-12).map(t=>`${t.id||t.key} — ${t.assignedAgent||t.agentId||'—'} — ${t.status||'—'}`).join('\n')||'Belum ada task.'; const artifactRows=(p.artifacts||[]).slice(-12).map(a=>`${a.name} (${a.bytes||0} byte)`).join(', ')||'Belum ada artefak.'; await send(a.item,a.chatId,`Detail ${projectLabel(p)} (${p.id})\nStatus: ${p.status||'—'}\nDiperbarui: ${p.updatedAt||'—'}\nTask:\n${taskRows}\nArtefak: ${artifactRows}`,projectKeyboard(p)); return {ok:true}; }
      if (parsed.name === 'projects') { const s=await office.snapshot(); const list=s.projects||[]; await send(a.item,a.chatId,list.map(x=>`${projectLabel(x)} (${x.id}) — ${x.status||'—'}`).join('\n')||'Belum ada proyek.', list.length===1?projectKeyboard(list[0]):officeKeyboard); return {ok:true}; }
      if (parsed.name === 'employees') { const s=await office.snapshot(); const agents=s.capabilities?.agents||[]; await send(a.item,a.chatId,agents.map(x=>`${x.agentId} — ${x.role||'Agen'} — ${x.readiness||'—'}`).join('\n')||'Data karyawan belum tersedia.', officeKeyboard); return {ok:true}; }
      if (parsed.name === 'tasks') { const s=await office.snapshot(); const rows=(s.projects||[]).flatMap(p=>(p.tasks||[]).map(t=>`${t.id||t.key||'task'} — ${t.assignedAgent||t.agentId||'—'} — ${t.status||'—'}`)); await send(a.item,a.chatId,rows.join('\n')||'Belum ada tugas.', officeKeyboard); return {ok:true}; }
      if (parsed.name === 'report') { const s=await office.snapshot(); const m=s.metrics||{}; await send(a.item,a.chatId,`Laporan kantor: ${m.totalProjects||0} proyek, ${m.activeProjects||0} aktif, ${m.completedProjects||0} selesai, ${m.failedProjects||0} gagal, ${m.waitingApproval||0} menunggu persetujuan, ${m.tokens||0} token tercatat.`, officeKeyboard); return {ok:true}; }
      if (parsed.name === 'evaluate') { const s=await office.snapshot(); const agents=s.capabilities?.agents||[]; await send(a.item,a.chatId,`Evaluasi hanya menyatakan status readiness aktual.\n${agents.map(x=>`${x.agentId}: ${x.readiness||'unverified'} (${x.model||'model belum diverifikasi'})`).join('\n')}`, officeKeyboard); return {ok:true}; }
      if (parsed.name === 'knowledge' || parsed.name === 'sop') { const s=await office.snapshot(); const docs=typeof getKnowledge==='function'?await Promise.resolve(getKnowledge()):s.knowledge?.documents||s.documents||[]; const rows=docs.filter(x=>parsed.name==='knowledge'||x.kind==='sop'||x.type==='sop').slice(-20).map(x=>`${x.name||x.title||x.id} — v${x.version||1} — ${x.updatedAt||'waktu tidak tersedia'}`); await send(a.item,a.chatId,rows.join('\n')||`Belum ada ${parsed.name==='sop'?'SOP':'dokumen pengetahuan'} yang tersimpan.`,officeKeyboard); return {ok:true}; }
      if (parsed.name === 'meeting') { const s=await office.snapshot(); const rows=(s.meetings||[]).filter(m=>!parsed.args||String(m.projectId)===parsed.args||String(m.id)===parsed.args).slice(-10).map(m=>`${m.id} — proyek ${m.projectId} — ${m.status||'—'} — ${(m.participants||[]).length} peserta`); await send(a.item,a.chatId,rows.join('\n')||'Belum ada meeting.', officeKeyboard); return {ok:true}; }
      if (parsed.name === 'publishing') { const s = await office.snapshot(); const enabled = s.capabilities?.publishing === true; await send(a.item, a.chatId, enabled ? 'Publikasi tersedia setelah tinjauan dan persetujuan pemilik.' : 'Publikasi belum terhubung. Sistem hanya menyiapkan draf; tidak ada konten yang diterbitkan.', officeKeyboard); return { ok: true }; }
      if (parsed.name === 'continue') { const s=await office.snapshot(); const candidates=(s.projects||[]).filter(p=>['queued','failed','blocked','paused'].includes(p.status)&&(!parsed.args||String(p.id)===parsed.args||String(p.instruction||'').toLowerCase().includes(parsed.args.toLowerCase()))); if(candidates.length!==1){await send(a.item,a.chatId,candidates.length?`Ditemukan ${candidates.length} proyek. Gunakan /continue ID.`:'Tidak ada proyek yang dapat dilanjutkan.');return {ok:true};} const p=candidates[0]; await office.control(p.id,p.status==='paused'?'resume':'retry',undefined,sourceId); await send(a.item,a.chatId,`Proyek dilanjutkan: ${p.id}.`); return {ok:true}; }
      const bits = parsed.args.split(/\s+/); const pid = bits.shift(); if (!pid) { await send(a.item, a.chatId, `ID proyek diperlukan untuk /${parsed.name}.`); return { ok: false }; }
      if (parsed.name === 'revise' && !bits.length) { await send(a.item, a.chatId, `Kirim alasan revisi: /revise ${pid} alasan perubahan.`); return { ok: false }; }
      const target = projectId(await office.snapshot(), pid); const reason = bits.join(' ') || undefined;
      try {
        if (office.control.length >= 4) await office.control(target, parsed.name, reason, sourceId); else await office.control(target, parsed.name, reason);
        await send(a.item, a.chatId, `Perintah /${parsed.name} diterima untuk proyek ${pid}.`);
      } catch (error) {
        await send(a.item, a.chatId, `Perintah /${parsed.name} gagal: ${error?.message || 'proyek tidak dapat diproses'}.`);
        return { ok: false, error: error?.message };
      }
      return { ok: true };
    }
    if (classification.intent !== 'ACTION_REQUEST') {
      const storedContext = await recallContext(memoryKey);
      const history = storedContext.messages || [];
      await remember(memoryKey, { role: 'user', content: text });
      let reply = '';
      try {
        let projectContext = [];
        if (classification.intent === 'PROJECT_DISCUSSION' || classification.intent === 'DEEP_DISCUSSION') {
          try {
            const snapshot = await office.snapshot();
            projectContext = (snapshot?.projects || []).slice(-8).map(project => ({ id: project.id, title: project.title || project.name || project.instruction, status: project.status, updatedAt: project.updatedAt }));
          } catch { projectContext = []; }
        }
        reply = typeof answerConversation === 'function'
          ? await answerConversation({ text, history, summary: storedContext.summary || '', longTerm: storedContext.longTerm || [], projectContext, intent: classification.intent, complexity: classification.complexity, connectorId: id, chatId: a.chatId, userId: a.userId })
          : '';
      } catch (error) {
        reply = '';
        await send(a.item, a.chatId, `Saya sedang mengalami kendala menjawab. ${error?.message || 'Coba lagi sebentar.'}`);
        return { ok: false, conversational: true, error: error?.message };
      }
      if (!reply) reply = classification.intent === 'CASUAL_CHAT' ? 'Lagi standby nih 😄 Ceritakan saja, aku dengarkan.' : 'Bisa kita bahas. Bagian mana yang ingin kamu dalami?';
      await remember(memoryKey, { role: 'assistant', content: String(reply) });
      await send(a.item, a.chatId, reply);
      return { ok: true, conversational: true, intent: classification.intent };
    }
    // Acknowledge before durable project creation. The acknowledgement is a
    // receipt only; the workflow worker remains responsible for execution and
    // later progress/final-result notifications.
    await send(a.item, a.chatId, 'Siap, Arya. Perintah diterima. Saya sedang menyiapkan proyek dan tim yang diperlukan.');
    const command = { sourceId, connectorId: id, chatId: a.chatId, instruction: text };
    const p = await office.create({ instruction: text, source: 'telegram', sourceId: command.sourceId, connectorId: id, chatId: a.chatId });
    // Keep the durable project ID useful without implying completion.
    if (p?.id) await send(a.item, a.chatId, `Proyek masuk antrean: ${p.id}.`);
    return { accepted: true, command, projectId: p?.id };
  }
  async function notify(project, event) {
    const s = await office.snapshot(); const p = typeof project === 'object' ? project : (s.projects || []).find(x => String(x.id) === String(project)); if (!p) return false;
    const command = (s.commands || []).find(c => c.id === p.commandId);
    const connectorId = command?.connectorId || p.connectorId || p.sourceConnectorId; const chatId = command?.chatId || p.chatId; const item = connectorId && getConnector(connectorId);
    if (!item || item.enabled === false || !item.token || !normalizeTelegramOwnerUserId(item.telegramOwnerUserId) || !chatId || idOf(item.telegramChatId || item.chatId) !== idOf(chatId)) return false;
    await send(item, chatId, `[${event?.type || event?.status || 'progres'}] ${projectLabel(p)}${event?.message ? ` — ${event.message}` : ''}`); if (event?.artifact && sendArtifact) await sendArtifact(item, chatId, event.artifact); return true;
  }
  async function notifySummary(connectorId, text) {
    const item = connectorId && getConnector(connectorId);
    const owner = normalizeTelegramOwnerUserId(item?.telegramOwnerUserId || item?.ownerUserId);
    const chatId = idOf(item?.telegramChatId || item?.chatId);
    if (!item || item.enabled === false || item.inboundEnabled === false || !item.token || !owner || !chatId || msgSafe(item) === false) return false;
    await send(item, chatId, String(text || '').slice(0, 4000));
    return true;
  }
  function msgSafe(item) { return item?.type === 'telegram'; }
  return { handle, notify, notifySummary };
}



