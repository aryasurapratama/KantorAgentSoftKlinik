# Stage 9 production readiness

`GET /api/production/audit` evaluates local implementation and configuration without network calls. Each capability is classified as `READY`, `IMPLEMENTED_BUT_UNTESTED`, `NEEDS_FIX`, `NOT_IMPLEMENTED`, `REQUIRES_CREDENTIALS`, or `REQUIRES_OWNER_APPROVAL`.

Runtime endpoints:

- `/api/health/live` — process liveness.
- `/api/health/ready` — storage/workflow readiness and model verification state.
- `/api/health/runtime` — worker, queue, inference, storage, and Telegram poller counters.
- `/api/production/audit` — truthful local readiness classification.
- `/api/backup` — state export with SHA-256 manifest.
- `POST /api/backup/verify` — schema/hash dry-run; never restores data.

Deployment templates: `Dockerfile`, `docker-compose.stage9.yml`, `deploy/nginx.stage9.conf`, and `deploy/README.md`. Templates are not deployment evidence. No image build, server deployment, TLS certificate, PostgreSQL migration, Redis lease, object storage, video service, or social platform activation is claimed.

The worker and supervisor loops are persistent within one application replica. Run one replica while Telegram polling uses local state; multi-replica operation requires an external queue/lease and a single Telegram update consumer. Shutdown handlers stop timers, Telegram polling, outbox delivery, workflow workers, and the HTTP listener gracefully.

Before production launch, configure secrets through a secret manager, set `API_ALLOWED_HOSTS` and `API_ALLOWED_ORIGINS` for the reverse proxy, bind the numeric Telegram owner ID and private chat, verify the selected model, test backup restoration in an isolated directory, configure HTTPS/firewall/reverse proxy, and obtain owner approval for external publishing. Missing credentials and evidence remain explicit. Grade 10/10 is not inferred from local readiness.
