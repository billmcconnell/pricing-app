import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { scheduleDailyBackup } from './backup.js';
import { createDb, defaultDbPath } from './db.js';

// On Fly the rclone config arrives as a secret; materialize it before first use.
const rcloneConf = process.env.RCLONE_CONF;
if (rcloneConf) {
  const confDir = join(homedir(), '.config', 'rclone');
  const confPath = join(confDir, 'rclone.conf');
  if (!existsSync(confPath)) {
    mkdirSync(confDir, { recursive: true });
    writeFileSync(confPath, rcloneConf, { mode: 0o600 });
  }
}

const dbPath = defaultDbPath();
const db = createDb(dbPath);
const app = buildApp(db, { webDist: process.env.WEB_DIST });

const backupRemote = process.env.BACKUP_RCLONE_REMOTE;
if (backupRemote) {
  scheduleDailyBackup(
    dbPath,
    process.env.BACKUP_DIR ?? tmpdir(),
    backupRemote,
    Number(process.env.BACKUP_HOUR_UTC ?? 3),
    app.log,
  );
}

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
