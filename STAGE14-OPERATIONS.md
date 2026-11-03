# Tahap 14 — autonomous engineering evidence

Branch pengembangan: `stage14-autonomous-engineering`.

Tahap ini memperkuat sistem yang sudah ada. Tidak ada deployment produksi, force push, penghapusan database, atau perubahan kredensial otomatis.

## Perubahan yang aktif

- Resource telemetry bounded pada `/api/health/resources` dan `/api/health/runtime`: RSS, heap, CPU, load average, rasio batas memori. Default batas RSS 12 GiB; sampling 30 detik.
- Budget proyek kini ditegakkan selama workflow. `tokenBudget`, `retryBudget`, dan `durationBudgetMs` menghentikan pekerjaan dengan status `BLOCKED` dan bukti `RESOURCE_BUDGET_EXCEEDED`.
- Benchmark terikat `projectId` agar tugas dari proyek lain tidak mencemari evaluasi karyawan.
- Grade-14 matrix menyimpan 15 benchmark dengan status `verified`, `failed`, atau `not_run`; skor kosong sampai bukti lengkap tersedia. Endpoint: `/api/operations/grade14`.
- Self-development memiliki fase read-only `OBSERVE`, validasi, descriptor pull request diff-locked, owner approval, apply, dan rollback. Endpoint baru:
  - `POST /api/self-development/proposals/:id/observe`
  - `POST /api/self-development/proposals/:id/pull-request`
  - `POST /api/self-development/proposals/:id/pr`
- Persetujuan proposal ditolak jika descriptor PR belum siap atau hash diff berubah.

## Batas yang tetap berlaku

Codex CLI berjalan di worktree terisolasi dengan sandbox. GitHub write actions tetap preview + approval. Nama kepala kantor tetap **ARYA AI**. Bukti prompt, memory, dan workflow tidak disebut sebagai retraining model.

## Verifikasi

```powershell
npm.cmd test
npm.cmd run build
node --test tests/resource-monitor.test.js tests/grade14-benchmarks.test.js tests/self-development-engine.test.js
```

Grade 10/10 tidak diklaim otomatis. `/api/operations/grade14` melaporkan `not_verified` sampai 15 benchmark memiliki bukti aktual.
