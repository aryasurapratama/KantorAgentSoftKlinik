# Arya AI Office — Tahap 8

Tahap 8 menambahkan memori pengetahuan dan pengukuran kemampuan berbasis bukti.

- `knowledge-base.js` menyimpan entri `document`, `sop`, `client`, `experience`, dan `error` dengan sumber, versi, waktu pembaruan, akses, serta `clientId`/`projectId`.
- Retriever membatasi jumlah entri dan karakter, memfilter client/project/aktor, dan selalu mengembalikan provenance. Isi dokumen diperlakukan sebagai data tidak tepercaya.
- Dokumen lama tetap berada di `data/state.json`; endpoint `GET /api/knowledge`, `GET /api/knowledge/search`, `POST /api/knowledge/experience`, dan `POST /api/knowledge/errors` tersedia. Gunakan header `x-client-id` untuk ruang klien.
- Task operasional mencatat fase `UNDERSTAND`, `ANALYZE`, `RETRIEVE`, `PLAN`, `EXECUTE`, `VERIFY`, `IMPROVE`, `DELIVER` pada reasoning run. Fase hanya selesai berdasarkan bukti yang dicatat.
- `operations.json` menyimpan pengalaman, error, versi prompt/model/tool/context, reasoning task, dan status aktif versi. Endpoint versi menyediakan publish dan rollback eksplisit.
- Profil karyawan pada snapshot memuat identitas, model, alat, ruang akses, riwayat task, evaluasi, SOP, dan rekomendasi yang tersedia. Skor kosong tetap `null`.
- Benchmark runner di `stage8-intelligence.js` menghitung pass rate dan skor dari evaluator aktual; tidak mengklaim Grade 10/10 tanpa kasus dan evidence.
- Telegram menambah `/knowledge`, `/sop`, `/pengetahuan`, dan `/prosedur`. Perintah hanya membaca metadata tersimpan dan tetap memakai owner ID plus private chat binding.

Dashboard `GET /api/performance` dan `GET /api/employees/:agentId/profile` menampilkan data kinerja aktual. RAG tidak menggunakan embedding atau PDF dan tidak menganggap proyek lama relevan tanpa filter konteks. Video MP4, publikasi sosial, deployment, dan layanan eksternal tetap unavailable sampai adapter resmi terhubung serta terverifikasi.
