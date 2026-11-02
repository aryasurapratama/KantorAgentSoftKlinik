# Struktur kantor AI Softklinik Harmes

35 agen AI, 8 divisi. Sebanyak 13 profil memakai nama dan jabatan tim yang tercantum di [website Softklinik](https://softklinik.id/tentang-kami); 22 peran tambahan diberi nama **AI** dan badge **AI tambahan**. Seluruhnya representasi agen, bukan laporan jumlah pegawai manusia Softklinik.

## Divisi dan tanggung jawab

| Divisi | Agen | Fokus |
| --- | --- | --- |
| Pimpinan & Produk | Arya, Sigit, AI Manajer Produk | Strategi bisnis, koordinasi proyek, kebutuhan pelanggan, prioritas produk. |
| Teknologi | Fajri, Dhensa, Drian, Vimala, Waliyudin, Ksanti, Imam | Analisis sistem, pengembangan aplikasi, backend, frontend, DevOps, pengujian. |
| Konten & Kreatif | Berkah, Rifandi, Wibisono, AI Strategis Konten, AI Penulis Konten, AI Media Sosial, AI Editor Video, AI Desainer Grafis | Strategi konten, copywriting, kalender sosial, storyboard, arahan editing, animasi, desain. |
| Marketing | AI Pimpinan Marketing, AI Spesialis SEO, AI Spesialis Iklan, AI Analis Marketing | Positioning, kampanye, SEO, rancangan iklan, evaluasi konversi. |
| Penjualan & Kemitraan | AI Pengembang Prospek, AI Eksekutif Akun, AI Kemitraan | Kualifikasi prospek, skrip penjualan, demo, proposal, kerja sama. |
| Pelanggan & Implementasi | Eka, AI Sukses Pelanggan, AI Implementasi, AI Pelatih Produk | Support, onboarding klinik, migrasi terencana, adopsi produk, pelatihan. |
| Operasional | AI Operasional SDM, AI Keuangan, AI Legal | Pembagian kerja, SOP, rekrutmen, anggaran, draf administrasi dan kontrak. |
| Keamanan & Data | AI Keamanan Privasi, AI Integrasi Data, AI Alur Klinik | Akses dan privasi, pemetaan integrasi, kualitas data, alur operasional software klinik. |

Nama lengkap, jabatan asli, deskripsi, dan instruksi tiap agen tersedia di `public/team.json`.

## Prioritas untuk bisnis

Jika kebutuhan pelanggan dan kapasitas tim membenarkan perekrutan manusia, isi fungsi yang belum terwakili lebih dahulu:

1. **Konten dan video:** produksi konten edukasi, demo produk, studi kasus, video pendek. Satu orang dapat merangkap penulisan, pengambilan gambar, dan editing pada tahap awal.
2. **Marketing:** positioning, distribusi konten, SEO, kampanye, pengukuran prospek masuk. Pisahkan dari sekadar mengunggah konten.
3. **Sales dan kemitraan:** tindak lanjut prospek, demo, proposal, negosiasi, kerja sama klinik.
4. **Customer success dan implementasi:** bantu pelanggan mulai memakai produk, pelatihan, evaluasi penggunaan, pembaruan layanan.

HR, finance, legal, keamanan, dan integrasi tetap perlu penanggung jawab. Bentuk pekerjaannya dapat dirangkap, paruh waktu, atau konsultan sesuai skala dan kebutuhan; daftar agen AI tidak berarti perlu merekrut 35 orang.

## Cara memberi pekerjaan

Pilih divisi pada tampilan kantor. Pada mode 2D, pilihan ini memfokuskan area divisi dalam satu gedung; seluruh 35 agen tetap terlihat. **Seluruh kantor** dan **Lihat semua** mengembalikan tampilan gedung lengkap. **Tugas divisi** melibatkan perwakilan yang relevan, maksimal lima langkah berurutan. **Buat tugas** juga menyediakan tim inti dan seluruh agen individual. Pencarian direktori menerima nama, jabatan, atau keahlian.

Contoh tugas **Konten & Kreatif**:

> Siapkan paket video demo pendaftaran pasien berdurasi 45 detik. Audiens: pemilik klinik. Hasil: tujuan, hook, naskah, storyboard per adegan, teks layar, arahan editing, subtitle, caption, dan CTA. Tandai informasi produk yang perlu dikonfirmasi.

Contoh tugas **Marketing**:

> Susun kampanye 30 hari untuk memperoleh permintaan demo Softklinik. Sertakan segmen klinik, pesan utama, kanal, ide konten, rancangan pengujian iklan, KPI, dan data yang harus dikumpulkan. Jangan mengarang anggaran atau hasil kampanye.

Contoh tugas **Pelanggan & Implementasi**:

> Buat rencana onboarding klinik baru: pengumpulan kebutuhan, persiapan akses, pemetaan data, pelatihan staf, checklist go-live, dan tindak lanjut minggu pertama.

## Kemampuan saat ini

Agen menghasilkan teks: saran, naskah, storyboard, arahan editing, draf desain, kode, dan rencana kerja. **Editor Video belum merender atau mengedit berkas video otomatis.** Publikasi konten, pembelian iklan, kontak prospek, dan eksekusi perubahan masih dilakukan pengguna. Rekomendasi legal/keuangan perlu ditinjau pihak yang berwenang; agen alur klinik berfokus pada software, bukan diagnosis medis.

Seluruh agen memakai satu model Ollama dengan instruksi berbeda. Inferensi tetap berurutan. Mode awal Canvas 2D ringan menampilkan kantor isometrik 2.5D dengan 8 divisi dan 35 agen sekaligus, serta resepsionis, ruang rapat, kafe, dan area santai. Latar statis memakai cache tanpa WebGL. Zoom, geser, dan jeda animasi tersedia; direktori tetap mencakup seluruh agen. Mode 3D opsional memakai Three.js/WebGL untuk menampilkan seluruh gedung, 8 divisi, dan 35 agen low-poly sekaligus, termasuk resepsionis, ruang rapat, lounge, pantry, dan teras. Fokus divisi menggerakkan kamera dalam gedung yang sama tanpa menghapus agen lain. Seret untuk memutar, gulir untuk zoom, dan gunakan kontrol tampilan keseluruhan untuk melihat seluruh kantor. Mode ini dapat memakai CPU/GPU lebih tinggi; FPS bergantung perangkat.
