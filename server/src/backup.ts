// SQLite backup + restore. ADR-0003 chose SQLite partly because backup is one
// file: we snapshot with SQLite's online backup API (safe while the app runs),
// gzip it, and optionally push it to an rclone remote (Google Drive).
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import Database from 'better-sqlite3';

export async function backupDatabase(dbPath: string, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const snapshot = join(outDir, `pricing-app-${stamp}.db`);
  const db = new Database(dbPath, { readonly: true });
  try {
    await db.backup(snapshot);
  } finally {
    db.close();
  }
  const gzPath = `${snapshot}.gz`;
  await pipeline(createReadStream(snapshot), createGzip(), createWriteStream(gzPath));
  rmSync(snapshot);
  return gzPath;
}

export async function restoreDatabase(gzPath: string, targetDbPath: string): Promise<void> {
  const restored = `${targetDbPath}.restoring`;
  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(restored));

  const db = new Database(restored, { readonly: true });
  try {
    const check = db.pragma('integrity_check', { simple: true });
    if (check !== 'ok') throw new Error(`restored database failed integrity_check: ${String(check)}`);
  } finally {
    db.close();
  }

  // SQLite sidecar files from the previous database must not survive a restore.
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(targetDbPath + suffix)) rmSync(targetDbPath + suffix);
  }
  renameSync(restored, targetDbPath);
}

/** Upload a backup with rclone and prune old remote copies. Throws on failure. */
export function uploadBackup(gzPath: string, remote: string, retentionDays = 60): void {
  const copy = spawnSync('rclone', ['copy', gzPath, remote], { stdio: 'inherit' });
  if (copy.status !== 0) throw new Error(`rclone copy to ${remote} failed (exit ${copy.status})`);
  // Best-effort prune; a failed prune never fails the backup.
  spawnSync('rclone', ['delete', '--min-age', `${retentionDays}d`, remote], { stdio: 'inherit' });
}

export async function runBackup(dbPath: string, outDir: string, remote?: string): Promise<string> {
  const gzPath = await backupDatabase(dbPath, outDir);
  if (remote) {
    uploadBackup(gzPath, remote);
    rmSync(gzPath); // uploaded — no need to keep the local copy on a small volume
  }
  return gzPath;
}

/** Schedule runBackup daily at hourUtc, forever. Failures are logged, never fatal. */
export function scheduleDailyBackup(
  dbPath: string,
  outDir: string,
  remote: string,
  hourUtc: number,
  log: { info: (msg: string) => void; error: (err: unknown, msg: string) => void },
): void {
  const msUntilNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hourUtc, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  };
  const arm = () => {
    setTimeout(() => {
      runBackup(dbPath, outDir, remote)
        .then(() => log.info(`backup uploaded to ${remote}`))
        .catch((err: unknown) => log.error(err, 'backup failed'))
        .finally(arm);
    }, msUntilNext()).unref();
  };
  arm();
  log.info(`daily backup scheduled at ${String(hourUtc).padStart(2, '0')}:00 UTC → ${remote}`);
}
