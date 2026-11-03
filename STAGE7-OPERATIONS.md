# Arya AI Office — Tahap 7

Tahap 7 menambahkan supervision persisten tanpa mengarang aktivitas.

- Supervisor menyimpan scan, masalah, recovery, reassignment, heartbeat, dan event korelasi di `operations.json`.
- Monitoring membedakan tugas `STUCK`, `FAILED`, `BLOCKED`, dan `UNASSIGNED` berdasarkan status serta heartbeat aktual.
- Recovery dan reassignment dibatasi percobaan, menyimpan alasan, agen lama/baru, dan audit.
- Worker supervisor berjalan di backend setiap 30 detik; browser tidak diperlukan.
- Endpoint operasional tersedia di `/api/operations/supervisor`, `/api/operations/supervisor/scan`, serta endpoint heartbeat/recover/reassign task.
- Budget project/agent, token provider aktual, retry, durasi, warning threshold, dan ranking deadline tersedia di `budget-priority.js`.
- Evaluator performa memakai completion, quality evidence, dan independent review; data yang belum ada tetap `null`.
- Telegram proactive reporting memakai outbox durable, filter event penting, deduplikasi, owner binding, dan periodic summary opt-in 5–1440 menit.

Autonomous recovery tidak menjalankan tool eksternal yang belum terhubung. Video rendering, social publishing, production deployment, dan biaya provider tetap memerlukan adapter resmi, izin, serta persetujuan pemilik.
