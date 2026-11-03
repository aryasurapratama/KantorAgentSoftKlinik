# Tahap 12 — GitHub Integration Center

Tahap ini menambahkan jalur GitHub yang dapat diaudit untuk Kantor AI. GitHub App menjadi jalur utama ketika `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, dan `GITHUB_APP_PRIVATE_KEY` tersedia. Kunci privat dan installation token hanya disimpan pada server lokal melalui storage terenkripsi; tidak pernah dikirim ke browser, model, atau Telegram.

## Konfigurasi lokal

1. Buat GitHub App dengan permission minimum: Metadata read, Contents read/write, dan Pull requests read/write. Tambahkan callback `http://127.0.0.1:4318/api/github/app/callback` pada konfigurasi App.
2. Isi environment server:

   ```text
   GITHUB_APP_ID=...
   GITHUB_APP_SLUG=...
   GITHUB_APP_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
   ```

3. Buka Integrasi → GitHub → Hubungkan GitHub App. GitHub menampilkan pilihan **Only select repositories**. Dashboard hanya menganggap koneksi `CONNECTED` setelah `/user` dan daftar repository berhasil diverifikasi.

OAuth lama tetap tersedia sebagai jalur profil read-only. Jika GitHub App belum dikonfigurasi, gunakan `gh auth login` dengan browser sebagai fallback lokal; jangan menempel token ke source code, UI, atau chat.

## Endpoint pusat integrasi

- `GET /api/github/status` — health, akun, permission, repository, pemeriksaan terakhir.
- `GET /api/github/repositories?search=` — repository yang benar-benar dikembalikan GitHub.
- `POST /api/github/repositories/select` — simpan daftar `owner/repository` yang diizinkan.
- `GET /api/github/repos/:owner/:repo/{branches,contents,commits,compare,pulls,issues}` — pembacaan melalui GitHub API nyata.
- `POST /api/github/operations/preview` lalu `POST /api/github/operations/:actionId/approve` — branch, pembaruan file, issue, dan pull request dengan persetujuan pemilik.
- `POST /api/github/disconnect` — melepas koneksi lokal. Revoke installation dilakukan dari GitHub App settings.

Operasi force push, penghapusan resource, perubahan secret, perubahan branch utama, dan perubahan permission App diblokir. Pull request harus berasal dari branch kerja. Token installation yang kedaluwarsa dilaporkan sebagai `TOKEN EXPIRED` dan meminta autentikasi ulang.

## Diagnostik

Kesalahan API dipetakan ke bahasa Indonesia: kredensial kedaluwarsa, izin repository kurang, repository tidak ditemukan, konflik, rate limit, timeout, dan gangguan jaringan. Pemeriksaan status memakai cache 30 detik untuk menghindari request berlebihan.

## Batas tahap ini

Clone, worktree sandbox, eksekusi test proyek, dan orkestrasi programmer masih mengikuti workspace coding terisolasi; pusat GitHub tidak mengeksekusi source code repository secara otomatis. Merge branch utama tetap memerlukan persetujuan pemilik. Uji end-to-end yang menulis repository harus memakai repository uji dan persetujuan eksplisit.
