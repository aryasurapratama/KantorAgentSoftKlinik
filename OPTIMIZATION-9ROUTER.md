# Audit dan optimasi router Kantor AI Harmes

Branch: `optimize-9router-fast-path`

## Temuan kode aktual

Kode tidak memiliki sembilan modul bernama `router`. Ia memiliki satu gateway provider bernama **9Router** dan sembilan jalur eksekusi yang tetap dipertahankan:

| Jalur | Entry point | Pemanggilan Codex/model | Dependensi |
| --- | --- | ---: | --- |
| Chat interaktif | `POST /api/chat` | 0 untuk fast path, 1 untuk AI | riwayat + knowledge scoped |
| Tugas agen | `POST /api/tasks` | 1 | satu agen |
| Tugas tim | `POST /api/tasks` `agentId=team` | 6 | langkah berurutan, kontribusi sebelumnya |
| Tugas departemen | `POST /api/tasks` `agentId=department:*` | maksimal 5 | kontribusi departemen |
| Meeting proyek | `office-workflow.js:run` | peserta + notulen | transkrip peserta berurutan |
| Website/flyer/video | `office-workflow.js:run` | meeting + spesialis + QA | artefak dan dependency gate |
| Coding lokal | `codingWorkspace.runJob` | 1 proses Codex CLI | workspace, model, 9Router health |
| Self-development | `self-development-engine.js:code` | 1 proses Codex CLI | proposal approved + worktree |
| Telegram | `telegram-command-center.js` | meneruskan ke chat/tugas/proyek | owner binding + outbox |

Urutan, model utama, agent, dan quality gates tidak dihapus. Context tetap scoped per agent/project. Coding tetap memakai `--ignore-user-config`, `--ephemeral`, sandbox `workspace-write`, dan provider `kantor_router`.

## Perubahan

- `fast-router.js` mengklasifikasikan pesan sebelum knowledge lookup atau slot model.
- `ping`, `halo`, `health-check`, `status` menghasilkan respons deterministik; `codexCalls=0`.
- `inference-scheduler.js` memakai prioritas interactive > coding > meeting > background. Queue cancellation membuang pekerjaan yang belum mulai.
- Batas concurrency default tetap `1` untuk Ollama/kompatibilitas laptop. 9Router memakai maksimal `2`; `AI_MAX_CONCURRENCY` dapat memilih `1` atau `2`.
- Provider timeout default `120000 ms`, configurable `AI_PROVIDER_TIMEOUT_MS`.
- Retry provider hanya transient network/408/429, maksimal `2`, configurable `AI_MAX_RETRIES` (default `1`).
- `/api/router/status` memakai cache dan single-flight TTL 5 detik.
- Provenance menyimpan lane, route, status, queue wait, token usage, dan timestamp. `/api/operations/performance` serta `/api/health/runtime` menampilkan scheduler.
- Coding job menyimpan `startupMs` dan `codexVersion` setelah proses CLI spawn; job tetap satu per workspace dan dapat dibatalkan.
- `scripts/benchmark-router.js` mengukur classifier. `scripts/benchmark-router-e2e.js` mengukur HTTP + mock provider.

## Benchmark

Baseline queue test sebelum perubahan: `npm.cmd test`, 121/121 lulus, wall `114.485 s`.

E2E mock provider, 3 putaran per kasus:

| Kasus | Sebelum fast path | Sesudah fast path | Provider calls |
| --- | ---: | ---: | ---: |
| ping | p50 `46.42 ms` | p50 `24.15 ms` | `3 -> 0` |
| halo | p50 `54.32 ms` | p50 `22.40 ms` | `3 -> 0` |
| percakapan biasa | p50 `50.17 ms` | p50 `52.00 ms` | `3 -> 3` |
| meeting classification | p50 `55.77 ms` | p50 `48.24 ms` | `3 -> 3` |
| coding kompleks | p50 `49.88 ms` | p50 `50.02 ms` | `3 -> 3` |

Perintah:

```powershell
npm.cmd run benchmark:router:e2e
$env:DISABLE_FAST_ROUTER='1'; npm.cmd run benchmark:router:e2e; Remove-Item Env:DISABLE_FAST_ROUTER
npm.cmd test
```

Angka mock mengukur overhead lokal, bukan inferensi provider nyata. Latensi model tetap dilaporkan melalui `ai.inference.total`, `ai.queue_wait`, `ai.model_load`, `ai.token_generation`.

Codex CLI terpasang: `codex-cli 0.124.0`. Startup probe `codex --version` (5 kali): `143.59, 96.66, 101.05, 97.35, 102.95 ms`; median `101.05 ms`. Tidak ada model call produksi dijalankan selama benchmark agar tidak mengubah proyek atau memakai kredensial nyata. Coding CLI tetap diukur melalui test spawn terisolasi dan metrik runtime saat pekerjaan lokal dijalankan.
