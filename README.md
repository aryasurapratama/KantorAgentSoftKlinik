# Kantor AI Softklinik Harmes

Kantor animasi dengan **35 agen AI dalam 8 divisi**: 13 profil berdasarkan tim di [SoftKlinik](https://softklinik.id/tentang-kami), ditambah 22 spesialis virtual untuk konten, video, marketing, sales, pelanggan, operasional, dan keamanan data. Peran tambahan berlabel **AI tambahan**. Nama dan peran tersimpan di `public/team.json`; agen bukan koneksi langsung dengan karyawan manusia. Semua agen berbagi satu model Ollama dengan instruksi peran berbeda. [Struktur lengkap dan contoh tugas](STRUKTUR-TIM.md).

## Buka aplikasi

Klik dua kali **Mulai Desktop.cmd** untuk jendela aplikasi tanpa tab, atau **Mulai Kantor AI.cmd** untuk browser biasa. Kantor animasi langsung terbuka di **http://127.0.0.1:4318**. Peluncur menyalakan Ollama dan server aplikasi di latar belakang. Untuk langsung membuka mode 3D, klik **Mulai Desktop 3D.cmd** atau jalankan `node scripts/desktop.js --3d`.

Jika model belum tersedia, jalankan di PowerShell:

```powershell
winget install --id Ollama.Ollama --exact
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen2.5:3b
```

Pengunduhan awal membutuhkan internet dan beberapa GB penyimpanan. Setelah model terpasang, AI lokal dapat dipakai tanpa internet. Model 3B dipilih untuk laptop dengan RAM sekitar 24 GB dan CPU Intel i7.

## Kinerja dan mode tampilan

Mode awal **2D ringan** memakai Canvas 2D dengan tampilan isometrik 2.5D: satu gedung luas berisi **8 divisi dan seluruh 35 agen**, ditambah resepsionis, ruang rapat, kafe, dan area santai. Tampilan awal memuat seluruh kantor sekaligus. Latar statis disimpan dalam cache untuk mengurangi penggambaran ulang, tanpa WebGL. Tombol **3D** membuka tampilan tiga dimensi terpisah; pilih **2D ringan** untuk kembali. Pilihan tersimpan di perangkat.

Desktop menggunakan Microsoft Edge yang sudah terpasang, dengan profil terpisah di `data/desktop-profile`. Tidak memerlukan Electron. Desktop memakai mesin render yang sama dengan browser sehingga membungkus 3D menjadi desktop saja belum tentu mengatasi lag. Mode 2D adalah pilihan utama untuk mengurangi beban grafis. Waktu jawaban AI tetap bergantung CPU dan ukuran model; tutup aplikasi berat saat menjalankan Ollama.

## Penggunaan

1. Buka **Pengaturan**, pilih Ollama, alamat `http://127.0.0.1:11434`, model `qwen2.5:3b`, lalu **Simpan & uji**.
2. Isi konteks bisnis: produk, pelanggan, gaya komunikasi, sasaran tim.
3. Klik ikon **Diskusi** pada kartu karakter untuk membuka chat dengan agen tersebut.
4. Klik **Buat tugas**. Pilih satu dari 35 agen, **Tim inti**, atau kolaborasi divisi. Pilihan **Tugas divisi** langsung memakai ruangan yang sedang dipilih.
5. Buka tugas di panel riwayat untuk melihat status, kontribusi tiap agen, dan mengunduh hasil Markdown. Tombol **Ruang kerja** membuka dashboard; **Kantor animasi** mengembalikan tampilan kantor.

## Gerakan dan kontrol kantor

Pada mode 2D, dropdown **Seluruh kantor** menampilkan satu gedung lengkap. Memilih divisi memfokuskan dan memperbesar area divisi di gedung yang sama; agen divisi lain tetap terlihat. Direktori samping memuat seluruh 35 agen; gunakan pencarian nama, jabatan, atau keahlian.

Pada mode 2D, klik karakter atau kartu anggota untuk berdiskusi. Seret tampilan untuk menjelajah; gulir atau gunakan **− / ＋** untuk zoom. **Lihat semua** mengembalikan seluruh kantor ke dalam tampilan; **Jeda gerak** menghentikan animasi suasana. **Buat tugas** menyediakan pilihan seluruh agen. Animasi berhenti saat jendela disembunyikan.

Karakter berjalan dan bersantai saat tidak ada pekerjaan. Gerakan santai serta percakapan ringan merupakan animasi suasana; status **Bekerja** mengikuti chat atau langkah tugas yang benar-benar sedang diproses. Saat mendapat tugas, agen berjalan ke meja dan bekerja; setelah selesai, kembali bersantai.

Mode 3D opsional memakai Three.js/WebGL untuk menampilkan seluruh gedung, 8 divisi, dan 35 agen low-poly sekaligus, termasuk resepsionis, ruang rapat, lounge, pantry, dan teras. Memilih divisi memfokuskan kamera pada area yang sama tanpa memuat ulang atau menghilangkan agen lain. Seret untuk memutar, gulir untuk zoom, dan gunakan kontrol tampilan keseluruhan untuk kembali melihat seluruh kantor.

Kantor 3D sekarang memakai denah headquarters terpadu dengan tapak arsitektur yang lebih luas: lobi dan drop-off publik, akses RFID/biometrik, delapan ruang kerja, laboratorium riset AI, area robotik dan prototipe, GPU/server/NOC/SOC, UPS dan pendingin, suite pimpinan, studio media, akademi, auditorium, kafe, musala, ruang pertolongan pertama, ruang laktasi, toilet aksesibel, koridor servis, loading, taman, parkir, serta pintu darurat. Ruang riset dan infrastruktur teknis berada di zona terbatas yang terpisah dari sirkulasi tamu.

Di tampilan 3D, pemilih **RUANG** memuat semua ruang bernama dan dikelompokkan menurut zona. **Label** menyembunyikan wayfinding, **Tampak atas** membantu membaca denah, dan **Simpan PNG** mengunduh tangkapan tampilan saat ini. Mode **Hemat** menonaktifkan bayangan dinamis; **Jernih** mengaktifkan bayangan satu kali dengan beban GPU lebih tinggi. Panel informasi menampilkan fungsi dan fitur ruang yang dipilih.

Setiap divisi memiliki ruangan berukuran **14 × 11 unit** dalam model 3D, bergaya gedung kantor premium: suite kaca berjeda, panel kayu, layar kerja, tanaman, papan nama gelap, lantai hangat, lobby resepsionis di tengah, ruang rapat dan kafe di kiri, ruang tunggu serta teras di kanan, ditambah registrasi tamu, pos keamanan, gerbang akses karyawan, pintu utama, taman depan, dan kendaraan. Kamera isometrik menampilkan seluruh gedung dengan ukuran ruangan yang konsisten. Klik label nama ruangan untuk mendekat; **Anggota tim** membuka direktori yang dapat disembunyikan agar kantor tetap terlihat utuh.

Pada mode 3D, **Lihat semua** mengembalikan kamera ke seluruh gedung. **Hemat** memakai resolusi terbatas dan maksimal 10 frame per detik; **Jernih** menaikkan ketajaman dan batas menjadi 20 frame per detik dengan beban grafis lebih tinggi. **Tugas** membuka panel pekerjaan; **Buat tugas** memakai divisi yang sedang difokuskan atau tim inti pada tampilan keseluruhan. **Jeda animasi** menghentikan gerakan agen. Jika WebGL gagal, gunakan tombol **Buka 2D Ringan**.

Tampilan 3D memerlukan browser dengan WebGL dan dapat memakai CPU/GPU lebih tinggi; performa serta FPS bergantung perangkat. Jika WebGL tidak tersedia, gunakan mode 2D ringan. Aset kantor dan Three.js disimpan lokal, tanpa CDN atau unduhan aset saat aplikasi dibuka.

Kolaborasi **Tim inti** memakai lima panggilan model berurutan: rencana Arya, kontribusi Sigit, Fajri, Dhensa, lalu rangkuman Arya. Kolaborasi divisi melibatkan perwakilan, maksimal lima langkah; langkah terakhir menyusun hasil gabungan. Seluruh 35 agen tersedia untuk chat dan tugas individual. Chat dan tugas memakai antrean inferensi yang sama supaya CPU laptop tetap responsif.

Agen menghasilkan saran, draf, dan kode. Editor video menyiapkan naskah, storyboard, serta arahan editing; belum mengedit atau merender berkas video. Versi ini belum mengirim pesan, menerbitkan konten, membeli iklan, mengakses data klinik, membaca folder pribadi, atau mengeksekusi kode otomatis. Tinjau hasil sebelum digunakan.

## Penyimpanan

- `data/state.json`: percakapan, tugas, hasil, aktivitas.
- `data/settings.json`: konfigurasi provider, model, konteks, API key bila dipakai.

## Integrasi GitHub dan website

Buka **Ruang kerja → Integrasi akun**. GitHub memakai OAuth resmi; website/CMS memakai konfigurasi konektor. Mode awal hanya baca. Perubahan kode, publish, deploy, penghapusan, dan tindakan eksternal memerlukan persetujuan eksplisit.

Untuk OAuth GitHub, buat OAuth App di GitHub lalu isi `GITHUB_CLIENT_ID` dan `GITHUB_CLIENT_SECRET` pada environment server. Alternatif lokalnya, masukkan Personal Access Token read-only pada formulir konektor. Website/CMS menerima URL HTTPS dan application password/token. Jangan masukkan secret ke frontend, repository, atau chat.

Untuk menghubungkan Telegram, buat bot melalui [@BotFather](https://t.me/BotFather), salin token bot, lalu buka **Ruang kerja → Integrasi akun → Telegram → Hubungkan**. Token dikirim hanya ke server lokal melalui koneksi aplikasi, diverifikasi dengan Telegram `getMe`, lalu disimpan di `data/settings.json`; token tidak dikembalikan ke browser atau dikirim ke model AI. Integrasi ini menyiapkan konektor bot dan belum mengirim pesan otomatis.

Tugas yang terputus saat server dimatikan ditandai gagal ketika server kembali hidup. Antrean yang belum dimulai dilanjutkan otomatis.

Mode Ollama menggunakan layanan lokal. Pilihan API kompatibel OpenAI tersedia di Pengaturan; mode itu memerlukan akun penyedia, internet, dan mungkin biaya. Kunci API tersimpan di laptop dan tidak dikirim kembali ke browser.

Referensi integrasi API: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat).

## Pengembangan

```powershell
npm.cmd ci
npm.cmd run dev
```

Frontend pengembangan: `http://127.0.0.1:5173`. Backend: `http://127.0.0.1:4318`. Untuk versi produksi: `npm.cmd run build; npm.cmd start`.

Jalankan `npm.cmd test` untuk menguji backend dengan layanan model tiruan yang terisolasi. Pengujian memeriksa validasi, riwayat percakapan, kolaborasi tim, antrean inferensi, dan penyimpanan setelah restart. Tidak memerlukan unduhan model atau akun API.

## Atribusi

Visual dan animasi kantor diadaptasi dari [humaedihume/kantor-agent](https://github.com/humaedihume/kantor-agent), berlisensi MIT. Lisensi disertakan di [public/office/LICENSE-kantor-agent.txt](public/office/LICENSE-kantor-agent.txt). Three.js memiliki [lisensi MIT tersendiri](public/office/assets/vendor/three/LICENSE); rincian tersedia di [THIRD_PARTY_NOTICES.md](public/office/THIRD_PARTY_NOTICES.md).
