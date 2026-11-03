# Kantor AI Softklinik Harmes

Kantor animasi dengan **35 agen AI dalam 8 divisi**: 13 profil berdasarkan tim di [SoftKlinik](https://softklinik.id/tentang-kami), ditambah 22 spesialis virtual untuk konten, video, marketing, sales, pelanggan, operasional, dan keamanan data. Peran tambahan berlabel **AI tambahan**. Nama dan peran tersimpan di `public/team.json`; agen bukan koneksi langsung dengan karyawan manusia. Semua agen berbagi satu model Ollama dengan instruksi peran berbeda. [Struktur lengkap dan contoh tugas](STRUKTUR-TIM.md).

## Buka aplikasi

Klik dua kali **Mulai Desktop.cmd** untuk jendela aplikasi tanpa tab, atau **Mulai Kantor AI.cmd** untuk browser biasa. Dashboard terbuka di **http://127.0.0.1:4318**; menu **Kantor animasi** membuka visual kantor. Peluncur menyalakan Ollama dan server aplikasi di latar belakang. Untuk langsung membuka kantor 3D, klik **Mulai Desktop 3D.cmd** atau jalankan `node scripts/desktop.js --3d`.

Jika model belum tersedia, jalankan di PowerShell:

```powershell
winget install --id Ollama.Ollama --exact
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen2.5:3b
```

Pengunduhan awal membutuhkan internet dan beberapa GB penyimpanan. Setelah model terpasang, AI lokal dapat dipakai tanpa internet. Model 3B dipilih untuk laptop dengan RAM sekitar 24 GB dan CPU Intel i7.

## Kinerja dan mode tampilan

Pilihan awal kantor animasi **2D ringan** memakai Canvas 2D dengan tampilan isometrik 2.5D: satu gedung luas berisi **8 divisi dan seluruh 35 agen**, ditambah resepsionis, ruang rapat, kafe, dan area santai. Tampilan awal memuat seluruh kantor sekaligus. Latar statis disimpan dalam cache untuk mengurangi penggambaran ulang, tanpa WebGL. Tombol **3D** membuka kantor tiga dimensi berisi 8 ruang divisi; pilih **2D ringan** untuk kembali. Pilihan tersimpan di perangkat.

Desktop menggunakan Microsoft Edge yang sudah terpasang, dengan profil terpisah di `data/desktop-profile`. Tidak memerlukan Electron. Desktop memakai mesin render yang sama dengan browser sehingga membungkus 3D menjadi desktop saja belum tentu mengatasi lag. Mode 2D adalah pilihan utama untuk mengurangi beban grafis. Waktu jawaban AI tetap bergantung CPU dan ukuran model; tutup aplikasi berat saat menjalankan Ollama.

## Penggunaan

1. Buka **Pengaturan**, pilih Ollama, alamat `http://127.0.0.1:11434`, model `qwen2.5:3b`, lalu **Simpan & uji**.
2. Isi konteks bisnis: produk, pelanggan, gaya komunikasi, sasaran tim.
3. Klik ikon **Diskusi** pada kartu karakter untuk membuka chat dengan agen tersebut.
4. Klik **Buat tugas**. Pilih satu dari 35 agen, **Tim inti**, atau kolaborasi divisi. Pilihan **Tugas divisi** langsung memakai ruangan yang sedang dipilih.
5. Buka tugas di panel riwayat untuk melihat status, kontribusi tiap agen, dan mengunduh hasil Markdown. Tombol **Ruang kerja** membuka dashboard; **Kantor animasi** mengembalikan tampilan kantor.
6. Buka **Insight** untuk melihat ringkasan percakapan, tugas, aktivitas, rasio penyelesaian, serta beban kerja per departemen. Angka hanya dihitung dari data lokal dan membantu memilih alur kerja berikutnya; bukan penilaian kinerja karyawan.

## Gerakan dan kontrol kantor

Pada mode 2D, dropdown **Seluruh kantor** menampilkan satu gedung lengkap. Memilih divisi memfokuskan dan memperbesar area divisi di gedung yang sama; agen divisi lain tetap terlihat. Direktori samping memuat seluruh 35 agen; gunakan pencarian nama, jabatan, atau keahlian.

Pada mode 2D, klik karakter atau kartu anggota untuk berdiskusi. Seret tampilan untuk menjelajah; gulir atau gunakan **− / ＋** untuk zoom. **Lihat semua** mengembalikan seluruh kantor ke dalam tampilan; **Jeda gerak** menghentikan animasi suasana. **Buat tugas** menyediakan pilihan seluruh agen. Animasi berhenti saat jendela disembunyikan.

Karakter berjalan dan bersantai saat tidak ada pekerjaan. Gerakan santai serta percakapan ringan merupakan animasi suasana; status **Bekerja** mengikuti chat atau langkah tugas yang benar-benar sedang diproses. Saat mendapat tugas, agen berjalan ke meja dan bekerja; setelah selesai, kembali bersantai.

Mode 3D memakai Three.js/WebGL untuk menampilkan satu kantor dengan **8 ruang divisi dan 35 agen** sesuai `public/team.json`. Seret untuk memutar dan gulir untuk zoom.

Di tampilan 3D, pemilih **DIVISI** menampilkan delapan ruang divisi dan tidak menampilkan ruang fasilitas tambahan. **Label** menyembunyikan nama ruang, **Tampak atas** memperlihatkan denah, **Reset tampilan** mengembalikan komposisi awal, dan **Simpan PNG** mengunduh gambar. Shortcut: **Home/R** reset, **T** tampak atas, **L** label, **Spasi** jeda, **+/−** zoom. Visual merupakan model WebGL bergaya arsitektur.

Setiap divisi memiliki ruangan berukuran **14 × 11 unit** dengan partisi kaca, panel kayu, layar kerja, tanaman, dan lantai hangat. Kamera isometrik menampilkan seluruh kantor. Klik label divisi untuk mendekat; **Anggota tim** membuka direktori yang dapat disembunyikan agar kantor tetap terlihat utuh.

Pada mode 3D, **Lihat semua** mengembalikan kamera ke seluruh gedung. **Hemat** memakai resolusi terbatas dan maksimal 10 frame per detik; **Jernih** menaikkan ketajaman dan batas menjadi 20 frame per detik dengan beban grafis lebih tinggi. **Tugas** membuka panel pekerjaan; **Buat tugas** memakai divisi yang sedang difokuskan atau tim inti pada tampilan keseluruhan. **Jeda animasi** menghentikan gerakan agen. Jika WebGL gagal, gunakan tombol **Buka 2D Ringan**.

Tampilan 3D memerlukan browser dengan WebGL dan dapat memakai CPU/GPU lebih tinggi; performa serta FPS bergantung perangkat. Jika WebGL tidak tersedia, gunakan mode 2D ringan. Aset kantor dan Three.js disimpan lokal, tanpa CDN atau unduhan aset saat aplikasi dibuka.

Kolaborasi **Tim inti** memakai lima panggilan model berurutan: rencana Arya, kontribusi Sigit, Fajri, Dhensa, lalu rangkuman Arya. Kolaborasi divisi melibatkan perwakilan, maksimal lima langkah; langkah terakhir menyusun hasil gabungan. Seluruh 35 agen tersedia untuk chat dan tugas individual. Chat dan tugas memakai antrean inferensi yang sama supaya CPU laptop tetap responsif.

Agen menghasilkan saran, draf, dan kode. Editor video menyiapkan naskah, storyboard, serta arahan editing; belum merender berkas video. GitHub dan CMS menyediakan pembacaan data; publikasi website, perubahan kode, deploy, dan iklan belum dijalankan otomatis. Pengiriman Telegram tersedia melalui pratinjau tujuan/isi dan persetujuan per pesan. Tinjau hasil sebelum digunakan.

## Penyimpanan

- `data/state.json`: percakapan, tugas, hasil, aktivitas.
- `data/settings.json`: konfigurasi provider, model, konteks, dan kredensial terenkripsi memakai perlindungan akun Windows (DPAPI) atau AES-GCM lokal pada sistem lain. API key tidak dikembalikan ke browser.
- `data/settings.json.bak`: cadangan terenkripsi untuk pemulihan atomik.

Penyimpanan memakai berkas sementara, flush, rename atomik, dan `.bak` versi sebelumnya. JSON rusak dikarantina lalu dipulihkan dari cadangan valid. Jika keduanya rusak, aplikasi memakai nilai awal dan mencatat `STORAGE_RECOVERY`. Pada sistem selain Windows, kunci AES berada di direktori data dengan izin `0600`: lindungi seluruh direktori. Percakapan/dokumen dan cadangan ekspor tetap berupa data terbaca.

Untuk memakai PostgreSQL, isi `DATABASE_URL` di `.env`, lalu jalankan `npm run migrate:postgres -- --force` satu kali. Aplikasi menyimpan `state.json`, `settings.json`, `operations.json`, dan `notifications.json` sebagai baris JSONB pada tabel `kantor_storage`. Settings tetap dienkripsi dengan DPAPI Windows atau AES-GCM sebelum masuk database. Tanpa `DATABASE_URL`, aplikasi tetap memakai penyimpanan berkas lokal.

**Pengaturan → Ekspor cadangan ruang kerja** menyimpan chat, tugas, aktivitas, serta dokumen tanpa token/config provider. **Pulihkan cadangan** meminta konfirmasi penggantian data; pekerjaan aktif harus selesai atau dibatalkan. Ukuran impor maksimal 32 MB. Retensi: 500 tugas, 2.000 pesan, 100 aktivitas; antrean maksimal 40 pekerjaan. Salinan `.bak` sebelumnya dapat masih memuat riwayat yang dihapus dari UI.

## Alur kerja dan keamanan lokal

Tugas mendukung pembatalan, pengulangan, hapus hasil, dan jadwal satu kali. Jadwal mengikuti zona waktu perangkat. Server harus berjalan; jadwal yang terlewat diproses saat server aktif kembali. Tugas yang dipulihkan dari cadangan ditandai gagal agar pengguna memilih pengulangan secara sadar.

**Basis pengetahuan** menerima TXT, Markdown, CSV, serta JSON: maksimal 20 dokumen, 100.000 karakter per dokumen, 1 juta karakter total. Potongan relevan dipilih dengan pencocokan kata dan disertakan pada chat/tugas dengan penanda `[Dokumen: nama]`. Belum memakai embedding atau membaca PDF. Pada mode API, potongan dokumen dikirim ke penyedia pilihan pengguna.

API memakai sesi `HttpOnly; SameSite=Strict`, CSRF, pemeriksaan Host/origin, serta pembatasan permintaan. API online dibatasi ke `api.openai.com`, `openrouter.ai`, dan hostname tambahan pada `AI_ALLOWED_HOSTS`. Mengganti origin/provider melepas API key lama; Ollama tidak menerima API key. `API_TOKEN` opsional menyediakan bearer untuk skrip. Aplikasi tetap untuk satu pemilik lokal; belum menyediakan akun multiuser/RBAC atau deployment publik. Proses yang berjalan sebagai pengguna OS yang sama berada dalam batas kepercayaan laptop.

Peluncur membandingkan sidik berkas sumber, membangun ulang frontend, dan memulai ulang server versi lama. **Restart Kantor AI.cmd** memulai ulang; **Hentikan Kantor AI.cmd** menghentikan server. Proses diverifikasi dari executable dan lokasi skrip sebelum dihentikan. Peluncur memakai lock OS agar dua proses start tidak saling menimpa PID. Muat ulang jendela setelah restart bila masih menampilkan versi lama.

## Integrasi GitHub dan website

Buka **Ruang kerja → Integrasi akun**. GitHub memakai GitHub App resmi dengan pilihan repository terpilih; website/CMS memakai konfigurasi konektor. Pusat GitHub menampilkan status, permission, repository, diagnostik, dan operasi yang tercatat. Perubahan kode, publish, deploy, penghapusan, dan tindakan eksternal memerlukan persetujuan eksplisit. Detail endpoint ada di [STAGE12-OPERATIONS.md](STAGE12-OPERATIONS.md).

Untuk GitHub App, isi `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, dan `GITHUB_APP_PRIVATE_KEY` hanya pada environment server. Daftarkan callback lokal `http://127.0.0.1:4318/api/github/app/callback`, lalu pilih **Only select repositories** pada GitHub. Installation token berumur pendek dan diperiksa sebelum operasi; token tidak dikembalikan ke browser atau dikirim ke AI/Telegram. Jika App belum tersedia, GitHub CLI browser (`gh auth login --web`) menjadi fallback lokal. OAuth lama tetap read-only untuk profil. Website/CMS membaca artikel WordPress REST API memakai Bearer token bila diperlukan; application password Basic belum didukung. Jangan masukkan secret ke frontend, repository, atau chat.

**Kelola** mempertahankan ID koneksi saat diedit dan menyediakan hapus koneksi. Pembacaan web menolak IP privat, mematok hasil DNS, menolak redirect, serta membatasi waktu/ukuran respons. Data konektor ditampilkan untuk ditinjau; belum otomatis masuk konteks model. Koneksi media sosial masih berupa konfigurasi, belum menarik statistik atau menerbitkan unggahan. Jika pengiriman Telegram terputus, periksa tujuan sebelum membuat pratinjau baru; pengiriman tidak diulang otomatis.

Untuk menghubungkan Telegram, buat bot melalui [@BotFather](https://t.me/BotFather), salin token bot, lalu klik **Telegram** pada sidebar kiri atau kartu **Integrasi alat kerja** di dashboard. Token diverifikasi dengan Telegram `getMe`, disimpan terenkripsi, tidak dikembalikan ke browser atau dikirim ke AI. Masukkan ID pengguna pemilik sebelum mengaktifkan instruksi masuk. Setelah tersambung, kirim `/start` dari chat pribadi pemilik untuk mengikat chat secara eksplisit; grup dan chat lain ditolak. Untuk mengirim pesan keluar, buka **Kelola**, isi ID chat dan pesan, klik **Tinjau sebelum kirim**, lalu periksa tujuan/isi sebelum **Setujui & kirim pesan**. Pratinjau berlaku 10 menit dan hanya dapat diproses sekali; perubahan konektor membatalkannya.

Telegram operasional memerlukan **ID pengguna pemilik**. Pesan `/start`, instruksi, dan perintah proyek dari akun atau grup lain ditolak; chat pribadi pemilik dapat diikat secara eksplisit. Pesan biasa sekarang masuk jalur percakapan Arya: sapaan, pertanyaan, brainstorming, dan pembahasan proyek tidak membuat proyek atau menjalankan tool. Proyek baru hanya dibuat dari perintah eksplisit, lalu dicatat persisten di menu **Operasional**, dengan ID perintah, rapat, kontribusi model aktual, tugas, artefak, pemeriksaan, status, dan audit. Perintah `/status`, `/projects`, `/employees`, `/tasks`, `/meeting`, `/evaluate`, `/report`, `/continue`, `/pause`, `/resume`, `/cancel`, `/approve`, `/reject`, `/revise`, dan `/retry` mengendalikan proyek. `/memory` menampilkan konteks percakapan, `/remember teks` menyimpan catatan jangka panjang atas permintaan pengguna, dan `/forget_memory` menghapus memori chat tersebut. Tombol inline Telegram memanggil endpoint perintah yang sama; callback dijawab oleh API Telegram. Persetujuan hanya menyelesaikan review internal; sistem tidak mengaku melakukan deployment atau publikasi sosial.

Pesan instruksi Telegram mendapat tanda terima segera: **“Siap, Arya. Perintah diterima. Saya sedang menyiapkan proyek dan tim yang diperlukan.”** Pembuatan proyek hanya mencatat pekerjaan ke penyimpanan lalu worker menjalankan meeting, agen, artefak, dan pemeriksaan secara terpisah. Memori percakapan disimpan terpisah per konektor/chat/pengguna (pada mode berkas berada di `data/telegram-conversations.json`), dibatasi ukurannya, dan dapat dihapus dari Telegram. Poller Telegram tidak menunggu inferensi sebelum menerima update berikutnya; offset tetap disimpan secara monoton agar update selesai tidak menimpa offset yang lebih baru. Status, sapaan, dan perintah administratif memakai jalur cepat tanpa memanggil model.

Jika bot tidak membalas, kirim `/start` dari chat pribadi akun pemilik yang dikonfigurasi. Chat pertama pemilik sekarang otomatis diikat, termasuk saat pesan biasa dikirim lebih dahulu. Status polling dapat diperiksa pada `GET /api/health/runtime`; `telegram.connectors[].lastError` menampilkan konflik webhook atau bot ganda. Saat server mulai, webhook lama dihapus agar long polling menerima pesan. Hanya satu proses Kantor AI boleh berjalan untuk satu bot Telegram.

Pengukuran runtime tersedia di `GET /api/operations/performance`. Endpoint ini melaporkan jumlah sampel, error, rata-rata, p50, p95, maksimum, antrean inferensi, serta pekerjaan aktif. Angka tersebut adalah pengukuran aktual perangkat dan provider; target ACK 1 detik dan jawaban sederhana 3 detik menjadi sasaran pengujian, bukan jaminan.

Pipeline website menghasilkan berkas HTML/CSS/JS terisolasi dan memeriksa struktur HTML, sintaks JavaScript, referensi eksternal, hash, serta integritas berkas. Pipeline flyer menghasilkan SVG yang disanitasi dan PNG nyata. Pipeline video menyimpan naskah/storyboard lalu berstatus terhambat sampai layanan generasi/render video dikonfigurasi; MP4 tidak dibuat oleh fallback. Notifikasi Telegram memakai outbox persisten dengan deduplikasi dan tidak mengulang pengiriman eksternal yang statusnya tidak pasti setelah restart.

Data operasional fase ini disimpan atomik di `data/operations.json`: `commands`, `projects`, `meetings`, `tasks`, `artifacts`, dan audit proyek. `data/notifications.json` menyimpan outbox Telegram. Artefak berada di `data/office-artifacts/<project-id>` dengan nama aman, mode lokal, hash SHA-256, pemeriksaan symlink, dan validasi integritas saat diunduh. Riwayat chat, tugas lokal lama, dokumen pengetahuan, dan pengaturan tetap berada di berkas terpisah seperti sebelumnya.

Tahap 6 menambahkan metadata brain per agen, izin alat berbasis peran, namespace memori level agen/proyek/organisasi, lifecycle task uppercase dengan event dan correlation ID, serta CRUD kampanye konten di endpoint `/api/operations/campaigns`. Detail arsitektur dan batas konektor ada di [STAGE6-OPERATIONS.md](STAGE6-OPERATIONS.md). Publikasi sosial, rendering MP4, deployment produksi, dan alat eksternal tetap dinyatakan belum terhubung sampai adapter resmi dan izin terverifikasi tersedia.

Tahap 7 menambahkan supervisor backend, heartbeat, deteksi tugas macet/gagal/terblokir, recovery dan reassignment berbatas, budget aktual, evaluasi performa, priority ranking, serta proactive Telegram reporting opt-in. Lihat [STAGE7-OPERATIONS.md](STAGE7-OPERATIONS.md). Semua pemulihan dibatasi dan dicatat; sistem tidak menjalankan atau mengklaim tindakan eksternal tanpa connector terverifikasi.

Tahap 8 menambahkan knowledge base berprovenance dan isolasi client/project, retriever terbatas, SOP, project experience/error learning, reasoning phases, profil profesional, benchmark runner, versi konfigurasi dengan rollback, endpoint performa, serta perintah Telegram `/knowledge` dan `/sop`. Detail implementasi dan batas bukti ada di [STAGE8-OPERATIONS.md](STAGE8-OPERATIONS.md). Skor evaluasi tetap `null` bila bukti belum tersedia; Grade 10/10 tidak diklaim otomatis.

Tahap 9 menambahkan audit readiness lokal (`/api/production/audit`), health liveness/readiness/runtime, backup manifest SHA-256 dan verifikasi dry-run, graceful shutdown, serta template Docker/nginx/compose. Lihat [STAGE9-OPERATIONS.md](STAGE9-OPERATIONS.md). Template deployment belum berarti server telah dideploy; TLS, secrets, database production, queue lease, provider, video, dan social publishing tetap memerlukan konfigurasi, pengujian eksternal, serta persetujuan pemilik.

Tahap 10 menambahkan Telegram Command Center, emergency stop persisten (`/stop_all`), callback kontrol berbasis ID proyek, laporan operasi (`/api/operations/report`), dan status karyawan berbasis task/event nyata. Lihat [STAGE10-OPERATIONS.md](STAGE10-OPERATIONS.md). Integrasi eksternal, deployment, publikasi, status 24/7, dan Grade 10/10 tetap memerlukan bukti serta konfigurasi pemilik.

Tahap 11 menambahkan pipeline self-development yang terukur: proposal maintenance dibuat dalam Git worktree terpisah, coding agent menulis perubahan melalui path allowlist, Quality Control menjalankan test/build/doctor, lalu pemilik menyetujui apply. Setiap proposal menyimpan diff hash, output pemeriksaan, commit, audit, dan rollback; secret, `data/`, `.git/`, `node_modules/`, serta deployment produksi tidak dapat diubah lewat pipeline. Endpoint dan alur rinci ada di [STAGE11-OPERATIONS.md](STAGE11-OPERATIONS.md).

Perintah Telegram self-development: `/perbaiki_kantor`, `/optimasi_kantor`, `/update_kantor`, `/tambah_fitur`, `/audit_kode`, `/cek_error`, `/cek_performa`, `/hasil_testing`, `/lihat_perubahan`, dan `/rollback`. Perintah perubahan hanya membuat proposal; validasi, persetujuan pemilik, apply, serta rollback tetap tercatat sebagai langkah terpisah.

Setiap tugas menyimpan agen, tujuan, kebutuhan, dependensi, keluaran, kriteria penerimaan, prioritas, percobaan ulang, dan bukti penyelesaian. Meeting menyimpan peserta, putaran, konflik, batas token/durasi, notulen, dan keputusan. Proyek yang tertunda, gagal, atau terblokir dapat dicari dan dilanjutkan dari Telegram; data proyek tetap terisolasi.

Tugas yang terputus saat server dimatikan ditandai gagal ketika server kembali hidup. Antrean yang belum dimulai dilanjutkan otomatis.

Mode Ollama menggunakan layanan lokal. Pilihan API kompatibel OpenAI tersedia di Pengaturan; mode itu memerlukan akun penyedia, internet, dan mungkin biaya. Kunci API tersimpan di laptop dan tidak dikirim kembali ke browser.

Referensi integrasi API: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat).

## Pengembangan

```powershell
npm.cmd ci
npm.cmd run dev
```

Frontend pengembangan: `http://127.0.0.1:5173`. Dashboard Kantor Agent: `http://127.0.0.1:4318/dashboard`. Port `20128` adalah dashboard/API 9Router, bukan dashboard Kantor Agent. Pengaturan 9Router tersedia di kartu **9Router** pada dashboard Kantor Agent atau menu **Pengaturan**. Monitoring menampilkan koneksi, jumlah model, latency, waktu pemeriksaan, endpoint gateway, URL dashboard, dan interval pemeriksaan; target dibatasi ke loopback. Untuk versi produksi: `npm.cmd run build; npm.cmd start`.

Jalankan `npm.cmd test` untuk pengujian backend, sesi/CSRF, OAuth, antrean, penyimpanan terenkripsi/pemulihan, konektor, dokumen, Studio Coding, dan peluncur. `npm.cmd run check:build` memeriksa ukuran bundle dan aset lokal. Setelah `npm.cmd run build`, jalankan `npm.cmd run test:hq`, `npm.cmd run test:workspace`, dan `npm.cmd run test:a11y` untuk pengujian browser Edge/Chrome; pemeriksaan a11y mencakup 27 kombinasi desktop, mobile, layar sempit, halaman, serta dialog. `npm.cmd run doctor` memeriksa runtime, enkripsi, sesi, server, dan model. `npm.cmd run check` menjalankan seluruh pemeriksaan. Pengujian memakai layanan tiruan terisolasi, tanpa akun eksternal.

## Coding dengan VS Code, Codex, dan 9Router

Klik **Mulai Coding VS Code.cmd** untuk membuka **Kantor Agent.code-workspace**. Peluncur memeriksa `http://127.0.0.1:20128/v1/models`, lalu membuka VS Code. Jika 9Router belum aktif, editor tetap terbuka; aktifkan 9Router dan akun/model yang dipakai sebelum menjalankan Codex. Opsi `--strict` menghentikan pembukaan editor bila pemeriksaan 9Router gagal.

```powershell
# Pemeriksaan tanpa membuka editor:
node scripts/coding.js --check

# Alternatif PowerShell:
.\scripts\coding.ps1 --check

# Buka editor hanya ketika 9Router siap:
node scripts/coding.js --strict
```

Di VS Code, buka **Terminal → Run Task**: **9Router: health check**, **Kantor AI: dev**, atau **Kantor AI: test**. Ekstensi Codex resmi (`openai.chatgpt`) direkomendasikan; pasang lewat panel Extensions bila belum tersedia. Gunakan ekstensi untuk coding interaktif di folder proyek. Untuk menjalankan Codex CLI melalui aplikasi, gunakan **Studio Coding → Mulai coding lokal**: aplikasi membuat konfigurasi per proses, memakai 9Router, dan mempertahankan berkas proyek di laptop. Gateway lokal 9Router meneruskan permintaan ke layanan model yang terhubung; letak gateway tidak menentukan tempat inferensi model.

Versi ekstensi dan CLI dapat berbeda. CLI 0.124 dapat menolak konfigurasi `agents.default_subagent_model` yang dikenali versi lain; peluncur memperingatkan keberadaan bentuk tersebut, tanpa mengubah berkas pengguna. Studio Coding mengabaikan konfigurasi pengguna untuk proses CLI tersebut dan menyetel provider dari pengaturan Studio. Tombol **Buka VSCode** menyiapkan catatan instruksi untuk diteruskan ke ekstensi Codex secara manual.

Konfigurasi Codex dan kredensial tetap memakai konfigurasi pengguna yang sudah ada, biasanya `%USERPROFILE%\.codex\config.toml`; `CODEX_HOME` dihormati bila sudah ditetapkan. Peluncur hanya membaca status routing, tanpa mencetak atau mengubah header/kredensial. Pemeriksaan mendeteksi konfigurasi langsung provider `9router`, endpoint lokal, dan protokol Responses; profil atau format TOML lain perlu ditinjau lewat pengaturan Codex. Daftar model membuktikan layanan merespons, belum membuktikan setiap model berhasil menghasilkan jawaban.

Tidak ada konfigurasi provider dalam `.codex/config.toml` proyek: [dokumentasi resmi OpenAI](https://developers.openai.com/codex/config-reference) menetapkan `model_provider` dan `model_providers` sebagai konfigurasi tingkat pengguna. Pengaturan provider di aplikasi Kantor AI dan di Codex dikelola terpisah. Tidak ada API key dalam workspace VS Code. Instalasi VS Code Windows standar dideteksi otomatis; untuk lokasi portabel gunakan environment `CODE_CMD` berisi lokasi lengkap `Code.exe`.

Uji peluncur: `node --test tests/coding.test.js`.

## Atribusi

Visual dan animasi kantor diadaptasi dari [humaedihume/kantor-agent](https://github.com/humaedihume/kantor-agent), berlisensi MIT. Lisensi disertakan di [public/office/LICENSE-kantor-agent.txt](public/office/LICENSE-kantor-agent.txt). Three.js memiliki [lisensi MIT tersendiri](public/office/assets/vendor/three/LICENSE); rincian tersedia di [THIRD_PARTY_NOTICES.md](public/office/THIRD_PARTY_NOTICES.md).
# Coding mandiri dan basis pengetahuan

Perintah coding kantor berjalan melalui worktree maintenance terpisah. Agen menerima workspace saat ini, menjalankan perubahan dengan sandbox `workspace-write`, lalu wajib menghasilkan diff. Proposal hanya berstatus siap ditinjau setelah `npm test` serta pemeriksaan build lulus. Reviewer terpisah dan persetujuan owner tetap diperlukan sebelum perubahan diterapkan; kegagalan tidak diklaim sebagai selesai.

Basis pengetahuan menyediakan `POST /api/knowledge/ingest` untuk satu URL HTTPS per permintaan. Pengambilannya memeriksa host publik, `robots.txt`, redirect, tipe konten, batas 1 MB, batas teks 100.000 karakter, timeout, dan SHA-256. Metadata sumber disimpan bersama dokumen di storage aktif, termasuk waktu ambil dan hash. Label `10/10` berarti seluruh pemeriksaan kualitas tangkapan lulus; sistem tidak mengklaim kebenaran fakta tanpa evaluasi sumber terpisah.
