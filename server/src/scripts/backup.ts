// Take a backup right now. Usage: pnpm backup [-- --out <dir>]
// Uploads to $BACKUP_RCLONE_REMOTE when set; otherwise keeps the local .gz.
import { tmpdir } from 'node:os';
import { defaultDbPath } from '../db.js';
import { runBackup } from '../backup.js';

const outFlag = process.argv.indexOf('--out');
const outDir = outFlag >= 0 ? process.argv[outFlag + 1] : (process.env.BACKUP_DIR ?? tmpdir());
const remote = process.env.BACKUP_RCLONE_REMOTE;

runBackup(defaultDbPath(), outDir, remote)
  .then((gzPath) => {
    console.log(remote ? `Backed up and uploaded to ${remote}` : `Backup written: ${gzPath}`);
  })
  .catch((err: unknown) => {
    console.error('Backup failed:', err);
    process.exit(1);
  });
