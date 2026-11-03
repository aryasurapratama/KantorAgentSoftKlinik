# Stage 9 deployment templates

`Dockerfile`, `docker-compose.stage9.yml`, and `nginx.stage9.conf` describe a reproducible deployment shape. They are templates only: no image build, server deployment, database migration, Redis, object storage, TLS, or external provider activation is claimed.

The application process includes the persistent task and supervisor loops. Run one `office` replica unless an external queue/lease is configured; multiple replicas can duplicate polling work.

The container sets `HOST=0.0.0.0` so the bundled reverse proxy can reach the service; local server runs keep the safer loopback default. The image healthcheck uses port `8787`, matching the compose service.

Before launch, provide secrets through a secret manager, configure `PORT`, `API_ALLOWED_HOSTS`, `API_ALLOWED_ORIGINS`, storage/database settings, Telegram owner ID, model provider credentials, backups, TLS, and an approval policy. Validate `/api/health` and recovery tests in the target environment.
