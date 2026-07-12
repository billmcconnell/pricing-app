import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { ASSUMPTION_SEEDS } from './assumptions.js';
import { hashPassword } from './auth.js';
import * as schema from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, '..', 'drizzle');

export type Db = ReturnType<typeof createDb>;

export function createDb(dbPath: string) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  seed(db);
  return db;
}

function seed(db: ReturnType<typeof drizzle<typeof schema>>) {
  db.insert(schema.appMeta)
    .values({ key: 'app_name', value: 'Data Lake Pricing' })
    .onConflictDoNothing()
    .run();

  // onConflictDoNothing: seeds fill gaps only — Admin edits to existing values survive restarts.
  db.insert(schema.assumptions).values(ASSUMPTION_SEEDS).onConflictDoNothing().run();

  const anyUser = db.select({ id: schema.users.id }).from(schema.users).limit(1).get();
  if (!anyUser) {
    db.insert(schema.users)
      .values({
        email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
        passwordHash: hashPassword(process.env.ADMIN_PASSWORD ?? 'change-me'),
        role: 'admin',
      })
      .run();
  }
}

export function defaultDbPath(): string {
  return process.env.DATABASE_PATH ?? join(here, '..', 'data', 'app.db');
}
