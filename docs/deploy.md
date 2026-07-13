# Deploying the pricing app

Decisions (issue 13, 2026-07-13): **Fly.io** hosting with Fly's edge TLS (automatic
Let's Encrypt certs — the Caddy-equivalent, no proxy to run), app auth as the only
gate on a non-guessable URL, and **nightly backups to Google Drive via rclone**.

The app is one Node process serving the API and the built SPA, with SQLite on a
Fly volume at `/data/app.db`. Margin and ACV data are sensitive: the login page is
internet-reachable, so use strong passwords and keep the seeded admin credentials
rotated (change `change-me` immediately).

## One-time setup

1. **Install flyctl** and sign in: `brew install flyctl && fly auth login`.

2. **Create the app and volume** (from the repo root):

   ```sh
   fly apps create pricing-app          # pick another name if taken; update fly.toml
   fly volumes create data --size 1 --region iad -a pricing-app
   ```

   (`iad` must match `primary_region` in `fly.toml` — change both if you prefer
   another region.)

3. **Configure rclone for Google Drive** (locally, once):

   ```sh
   brew install rclone
   rclone config        # n) new remote, name: gdrive, storage: drive, defaults are fine
   rclone mkdir gdrive:pricing-app-backups
   ```

4. **Set secrets**:

   ```sh
   fly secrets set -a pricing-app \
     ADMIN_EMAIL='you@example.com' \
     ADMIN_PASSWORD='<strong initial password>' \
     RCLONE_CONF="$(cat ~/.config/rclone/rclone.conf)"
   ```

   `RCLONE_CONF` is written to the machine's rclone config at boot. The admin
   seed only applies on an empty database; change the password in the app after
   first login regardless.

## Deploying (every time)

```sh
fly deploy
```

That's the whole procedure from a clean checkout: the Dockerfile builds the web
bundle and the server, and Fly swaps the machine. Verify with:

```sh
fly status -a pricing-app
curl -s https://pricing-app.fly.dev/api/health
```

The app is at `https://pricing-app.fly.dev` (stable URL, HTTPS enforced).

## Backups

The server process uploads a gzipped SQLite snapshot to
`gdrive:pricing-app-backups` daily at 03:00 UTC (config in `fly.toml`:
`BACKUP_RCLONE_REMOTE`, `BACKUP_HOUR_UTC`). Remote copies older than 60 days are
pruned after each successful upload. The snapshot uses SQLite's online backup
API, so it is safe while the app is serving.

- Check what's there: `rclone ls gdrive:pricing-app-backups`
- Trigger one manually on the machine: `fly ssh console -a pricing-app -C
  "node /app/server/dist/scripts/backup.js"`
- Watch the scheduler in logs: `fly logs -a pricing-app` (look for "backup uploaded").

## Restore

Local drill (works entirely on your machine — no Fly needed):

```sh
cd server
pnpm backup                          # writes /tmp/pricing-app-<stamp>.db.gz from the local db
pnpm restore -- /tmp/pricing-app-<stamp>.db.gz /tmp/restored.db
```

Production restore:

```sh
rclone copy gdrive:pricing-app-backups/pricing-app-<stamp>.db.gz /tmp/
fly ssh sftp shell -a pricing-app    # put /tmp/pricing-app-<stamp>.db.gz /data/restore.db.gz
fly ssh console -a pricing-app -C "node /app/server/dist/scripts/restore.js /data/restore.db.gz /data/app.db"
fly apps restart pricing-app
```

The restore script verifies `PRAGMA integrity_check` before swapping the file and
prints row counts (users/customers/environments/assumptions) so you can sanity-check
what you restored. Old `-wal`/`-shm` sidecars are removed as part of the swap.

## Local production smoke test

```sh
pnpm build
DATABASE_PATH=/tmp/prod-smoke.db WEB_DIST="$PWD/web/dist" NODE_ENV=production \
  node server/dist/index.js
# → http://127.0.0.1:3001 serves the SPA; /api/health is public; everything else needs login
```
