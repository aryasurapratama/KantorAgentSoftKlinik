import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTelegramMessage } from '../telegram-conversation.js';

const scenarios = [
  ['halo', 'CASUAL_CHAT'], ['hai Arya', 'CASUAL_CHAT'], ['lagi ngapain?', 'QUESTION'], ['makasih ya', 'CASUAL_CHAT'], ['wkwk lucu juga', 'CASUAL_CHAT'], ['aku typo nih', 'CASUAL_CHAT'],
  ['menurutmu AI bakal makin pintar?', 'DEEP_DISCUSSION'], ['gimana cara kerja cache?', 'QUESTION'], ['kenapa respons kadang lambat?', 'DEEP_DISCUSSION'], ['bandingkan Ollama dan API cloud', 'DEEP_DISCUSSION'],
  ['bahas proyek p1 dulu', 'PROJECT_DISCUSSION'], ['fitur memori kita menurutmu gimana?', 'DEEP_DISCUSSION'], ['website klinik ini sebaiknya seperti apa?', 'QUESTION'], ['kode ini aman nggak?', 'QUESTION'],
  ['apa status kantor sekarang?', 'QUESTION'], ['siapa yang standby?', 'QUESTION'], ['jelaskan PostgreSQL singkat', 'DEEP_DISCUSSION'], ['aku mau ganti topik', 'CASUAL_CHAT'],
  ['Buatkan website klinik', 'ACTION_REQUEST'], ['tolong perbaiki bug login', 'ACTION_REQUEST'], ['bikin ringkasan meeting', 'ACTION_REQUEST'], ['jalankan test unit', 'ACTION_REQUEST'], ['susun rencana migrasi', 'ACTION_REQUEST'], ['implementasikan endpoint health', 'ACTION_REQUEST'],
  ['tambahkan validasi input', 'ACTION_REQUEST'], ['audit keamanan repo ini', 'ACTION_REQUEST'], ['uji API lalu laporkan hasilnya', 'ACTION_REQUEST'], ['deploy ke staging', 'ACTION_REQUEST'], ['buat pull request untuk perubahan ini', 'ACTION_REQUEST'], ['commit perubahan setelah test', 'ACTION_REQUEST'],
  ['Arya, tolong bikin dashboard', 'ACTION_REQUEST'], ['tolong ubah warna tombol', 'ACTION_REQUEST'], ['kembangkan integrasi GitHub', 'ACTION_REQUEST'], ['mulai proyek konten', 'ACTION_REQUEST'], ['menurutmu perlu bikin agent baru?', 'DEEP_DISCUSSION'], ['apakah kode ini perlu di-refactor?', 'QUESTION'],
  ['bagaimana kalau proyek p2 ditunda?', 'DEEP_DISCUSSION'], ['jelaskan risiko deploy Jumat', 'DEEP_DISCUSSION'], ['diskusikan trade-off database', 'DEEP_DISCUSSION'], ['bahas strategi backup', 'DEEP_DISCUSSION'], ['proyek p3 belum selesai', 'PROJECT_DISCUSSION'], ['fitur baru ini menarik', 'PROJECT_DISCUSSION'],
  ['kantor AI kita butuh apa?', 'QUESTION'], ['sistemnya sudah aman?', 'QUESTION'], ['tolong cek error di API', 'ACTION_REQUEST'], ['coba lagi task p4', 'ACTION_REQUEST'], ['rancang SOP onboarding', 'ACTION_REQUEST'], ['buatkan notulen rapat besok', 'ACTION_REQUEST'],
  ['aku ingin ngobrol soal coding', 'PROJECT_DISCUSSION'], ['ngobrol santai tentang teknologi', 'CASUAL_CHAT'],
];

test('50 Telegram conversation scenarios preserve conversation-first routing', () => {
  assert.equal(scenarios.length, 50);
  for (const [input, expected] of scenarios) assert.equal(classifyTelegramMessage(input).intent, expected, input);
});

test('read-only project vocabulary never becomes an action request', () => {
  for (const input of ['lihat fitur ini', 'tampilkan sistemnya', 'cek fitur p1']) {
    assert.notEqual(classifyTelegramMessage(input).intent, 'ACTION_REQUEST', input);
  }
});
