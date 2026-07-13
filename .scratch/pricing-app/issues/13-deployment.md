# 13 — Deployment

Status: ready-for-human (machinery done — run the one-time setup in docs/deploy.md)

## What to build

Get the app running where Sales and Admin can reach it: an internal VM or container, TLS, and a backup story for the single SQLite file (ADR-0003 chose SQLite partly because backup is one file). Margin and ACV data are sensitive — hosting must not be world-readable, and access stays behind the app's auth.

HITL: the hosting target, domain, TLS approach, and backup destination are infrastructure decisions only Bill can make. Capture what's decided here in comments as it firms up.

## Acceptance criteria

- [ ] App reachable by Sales and Admin at a stable internal URL over HTTPS *(awaits Bill's one-time Fly setup — everything is scripted)*
- [ ] SQLite database backed up on a schedule to a location that survives the host *(scheduler + rclone upload built and tested locally; goes live with the deploy)*
- [x] A documented, repeatable deploy procedure (script or few-step runbook) from a clean checkout
- [x] Restore-from-backup tested once *(local drill on the real dev database: backup → gzip → integrity-checked restore → app booted from the restored file and quoted correctly; production restore steps in the runbook)*

## Blocked by

- 06-quote-screen-v1.md

## Comments

**Decisions (Bill, 2026-07-13):** hosting on **Fly.io**; public HTTPS with automatic certificates — Fly's edge TLS provides the chosen Caddy + Let's Encrypt behavior without running a proxy, so app login is the only gate (rotate the seeded admin password immediately); nightly backups to **Google Drive via rclone**.

**What's built (2026-07-13):**

- **Production serving**: the server now serves the built SPA (`@fastify/static` + SPA fallback) when `WEB_DIST` is set; the auth hook guards only `/api/*`; `trustProxy` on; session cookies get `secure` in production; host/port from `HOST`/`PORT` (Fly binds 0.0.0.0).
- **Backups** (`server/src/backup.ts`): SQLite online-backup API (safe while serving) → gzip → `rclone copy` to `BACKUP_RCLONE_REMOTE` (default `gdrive:pricing-app-backups`), pruning remote copies older than 60 days. The server schedules it in-process daily at `BACKUP_HOUR_UTC` (03:00) — hence `auto_stop_machines = "off"` in fly.toml. `pnpm backup` / `pnpm restore` run it manually; restore verifies `PRAGMA integrity_check` before swapping the file and clears `-wal`/`-shm` sidecars.
- **Image/config**: multi-stage `Dockerfile` (node:22-slim + rclone; `pnpm deploy` for isolated prod deps), `fly.toml` (volume `data` → `/data/app.db`, health check on `/api/health`, force_https), `.dockerignore` keeps the workbooks and `.scratch` out of the image.
- **Runbook**: `docs/deploy.md` — one-time setup (fly app + volume, local `rclone config` for the `gdrive` remote, secrets `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`RCLONE_CONF`), then `fly deploy` is the whole repeatable procedure. Backup verification and production restore steps included.
- **Verified locally**: full production build; backup+restore drill on the real dev DB (417 customers / 366 environments / 26 assumptions round-tripped); production-mode boot from the restored file served the SPA unauthenticated, kept the API guarded, and quoted OTQV at $112,000.

**Bill's remaining steps** (≈15 minutes, all in docs/deploy.md): install flyctl, `fly apps create` + `fly volumes create`, `rclone config` for Drive, `fly secrets set`, `fly deploy`, then tick the two open criteria once verified.
