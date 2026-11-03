# Tahap 11 — Self-development terukur

Tahap ini menyediakan proposal maintenance yang dapat diaudit melalui `/api/self-development`.

Alur perubahan:

1. `POST /api/self-development/proposals` membuat proposal dan Git worktree sementara.
2. `POST .../code` menjalankan Coding agent pada worktree tersebut; agent juga dapat menulis perubahan terstruktur melalui `POST .../changes`. Path dibatasi ke worktree dan secret/data path ditolak.
3. `POST .../validate` menjalankan pemeriksaan allowlist (`tests`, `build`, `doctor`) dan menyimpan output, file berubah, serta SHA-256 diff.
4. Pemilik menyetujui proposal lewat `POST .../approve` dengan `{"approved":true,"actor":"owner"}`.
5. `POST .../apply` membuat commit di worktree lalu cherry-pick ke workspace utama. Workspace utama harus bersih.
6. `POST .../rollback` membuat commit revert; deployment production tetap di luar pipeline ini.

Status hanya `proposed`, `validated`, `approved`, `applied`, `rolled_back`, atau `failed`. Sistem tidak menyatakan kualitas meningkat tanpa hasil test/benchmark yang tersimpan. Riwayat berada di `data/self-development.json`; worktree berada di `data/self-development/worktrees`. Secret, `data/`, `.git/`, `node_modules/`, serta modul approval/security/self-development dilindungi dari write agent.

Telegram menyediakan `/perbaiki_kantor`, `/optimasi_kantor`, `/update_kantor`, `/tambah_fitur`, `/audit_kode`, `/cek_error`, `/cek_performa`, `/hasil_testing`, `/lihat_perubahan`, dan `/rollback ID setujui`. Perintah membuat atau meninjau proposal; perubahan tetap membutuhkan validasi dan persetujuan pemilik.
