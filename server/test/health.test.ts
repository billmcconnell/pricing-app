import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { appMeta } from '../src/schema.js';

describe('database', () => {
  it('migrates and seeds the app_name row', () => {
    const db = createDb(':memory:');
    const row = db.select().from(appMeta).where(eq(appMeta.key, 'app_name')).get();
    expect(row?.value).toBe('Data Lake Pricing');
  });

  it('seeding is idempotent', () => {
    const db = createDb(':memory:');
    const rows = db.select().from(appMeta).all();
    expect(rows).toHaveLength(1);
  });
});

describe('GET /api/health', () => {
  it('returns ok with the app name read from SQLite', async () => {
    const db = createDb(':memory:');
    const app = buildApp(db);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', appName: 'Data Lake Pricing' });
  });
});
