# Kantor AI Arya — audit report

Tanggal audit: 3 November 2026 (Asia/Jakarta). Scope: repository lokal, test suite, dan konfigurasi yang tersedia. Integrasi Telegram/provider eksternal tidak dianggap berhasil tanpa kredensial dan bukti runtime.

## Nilai verifikasi lokal

**10/10 untuk quality gates repository lokal.** Nilai ini berasal dari bukti yang benar-benar dijalankan pada audit ini: 143 test backend lulus, build dan budget aset lulus, workspace browser lulus, headquarters browser lulus, 30 kombinasi accessibility lulus, `doctor` lulus, `npm audit --omit=dev` tanpa kerentanan, dan `git diff --check` bersih. Nilai ini tidak mengubah status integrasi eksternal yang belum memiliki bukti.

## Arsitektur terverifikasi

Telegram polling menerima update di `server.js`, memvalidasi private chat + owner allowlist, lalu meneruskannya ke `telegram-command-center.js`. Command center memilih fast response, perintah operasional, percakapan, atau pembuatan proyek durable. Percakapan memakai `telegram-conversation.js`; respons model melalui `ask()` dan `inference-scheduler.js`. Workflow durable berada di `office-workflow.js`, persistence memakai JSON/PostgreSQL adapter, frontend memakai Vite/React.

Router deterministik (`fast-router.js`) memisahkan greeting/health, chat, coding, meeting, dan project. Provider yang terkonfigurasi: Ollama, OpenAI-compatible, atau 9Router loopback. Token dibatasi origin; Telegram owner ID, rate limit, approval policy, backup verify, resource monitor, retry/timeout, dan graceful shutdown tersedia.

## Bukti audit

- `npm run build` dan `npm run check:build`: lulus; budget 109.9 KiB gzip JS dan 15.7 KiB gzip CSS.
- `npm run benchmark:router`: 100 putaran; router p95 0.0021–0.0073 ms pada probe lokal; ini bukan latency provider.
- `npm test` reproducible dengan `--test-concurrency=1`: 143 test lulus, 0 gagal.
- `npm run test:workspace`: lulus; alur dashboard, coding, modal, dokumen, chat, task, connector, Telegram, dan backup tervalidasi browser.
- `npm run test:hq`: lulus; 35 agen, 8 divisi, dan 8 ruang tervalidasi.
- `npm run test:a11y`: lulus; 30 kombinasi halaman/viewport tervalidasi axe; review assistive technology manual tetap diperlukan.
- `npm run doctor -- --json`: Node/dependency/build/credential storage/server/session/model terdeteksi sehat; kualitas jawaban model belum diuji.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerability.
- `git diff --check`: bersih.
- Docker build context kini mengecualikan `.env`, data runtime, dependency lokal, hasil build, dan metadata Git. Image runtime menjalankan `npm prune --omit=dev`.
- Container server bind ke `0.0.0.0` melalui konfigurasi Docker, sementara default lokal tetap `127.0.0.1`; reverse proxy compose dapat menjangkau service tanpa memperluas default lokal.
- Tombol pembatalan pekerjaan coding memiliki `type="button"` dan label aksesibilitas eksplisit; browser/accessibility suite tetap lulus.
- Reverse proxy mendukung host/origin HTTPS terkonfigurasi, meneruskan `X-Forwarded-Host`, dan menerima payload backup sampai 32 MB sesuai API.
- Adapter PostgreSQL memulihkan fallback tervalidasi secara persisten setelah primary dan previous value rusak; write JSON mengambil snapshot sebelum antrean.
- Concurrency test dibatasi satu proses karena beberapa fixture memakai workspace/provider lokal bersama; mode paralel sebelumnya menghasilkan flake. Ini dicatat sebagai batas verifikasi, bukan skor sempurna.

## Perubahan prioritas yang diterapkan

1. Topic words (`kode`, `sistem`, `proyek`) tidak lagi cukup untuk mengaktifkan specialist/team path ketika pesan berbentuk pertanyaan atau diskusi.
2. Router mengembalikan confidence dan membedakan `question` dari permintaan eksekusi eksplisit.
3. Memori Telegram tetap bounded dan terisolasi per connector/chat/user, kini menyimpan ringkasan sesi otomatis saat pesan lama dipangkas serta API `context`, `summary`, dan `longTerm`.
4. Jalur percakapan meneruskan ringkasan/fakta tersimpan ke coordinator sebagai konteks data, bukan instruksi berotoritas.
5. Ditambahkan 50 skenario reproducible untuk percakapan santai, typo/slang, pertanyaan, diskusi proyek, follow-up, dan tindakan eksplisit.

## Batas produksi yang masih terbuka

Provider dan Telegram membutuhkan kredensial/runtime eksternal. Docker CLI tidak tersedia di mesin audit, sehingga compose/image build belum dieksekusi; template dan regression checks tervalidasi. Tidak ada bukti latency p95 end-to-end di laptop pada audit ini. Video rendering dan social publishing tetap tidak tersedia. Grade benchmark 15-item tetap `not_verified` bila bukti per item belum diberikan; audit lokal 10/10 di atas hanya menilai quality gates yang dapat direproduksi dari repository.

## Urutan kerja berikutnya

Jalankan benchmark Telegram/provider dengan test account, ukur p50/p95 end-to-end, tambahkan summarizer model terpisah bila percakapan panjang memang membutuhkan kompresi semantik, lalu review perubahan self-development melalui proposal → test → approval. Jangan deploy atau merge otomatis.
