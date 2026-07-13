// Restore a backup over the app database. STOP THE APP FIRST.
// Usage: pnpm restore -- <backup.db.gz> [target-db-path]
import Database from 'better-sqlite3';
import { defaultDbPath } from '../db.js';
import { restoreDatabase } from '../backup.js';

// pnpm forwards the `--` separator; ignore it.
const [gzPath, target = defaultDbPath()] = process.argv.slice(2).filter((a) => a !== '--');
if (!gzPath) {
  console.error('Usage: pnpm restore -- <backup.db.gz> [target-db-path]');
  process.exit(1);
}

restoreDatabase(gzPath, target)
  .then(() => {
    const db = new Database(target, { readonly: true });
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    console.log(`Restored ${gzPath} → ${target}`);
    console.log(
      `  users: ${count('users')}, customers: ${count('customers')}, environments: ${count('environments')}, assumptions: ${count('assumptions')}`,
    );
    db.close();
  })
  .catch((err: unknown) => {
    console.error('Restore failed:', err);
    process.exit(1);
  });
