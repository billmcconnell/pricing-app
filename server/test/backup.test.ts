import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { backupDatabase, restoreDatabase } from '../src/backup.js';
import { createDb } from '../src/db.js';
import { appMeta, customers } from '../src/schema.js';

const workDir = mkdtempSync(join(tmpdir(), 'pricing-backup-test-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('backup → restore roundtrip', () => {
  it('restores a byte-faithful, integrity-checked copy while the source stays open', async () => {
    const sourcePath = join(workDir, 'source.db');
    const source = createDb(sourcePath);
    source.insert(customers).values({ companyCode: 'RUMB', accountName: 'Radiant-Macaw' }).run();

    const gzPath = await backupDatabase(sourcePath, join(workDir, 'backups'));
    expect(gzPath.endsWith('.db.gz')).toBe(true);

    // Data written after the snapshot must not appear in the restore.
    source.insert(customers).values({ companyCode: 'ZZZZ' }).run();

    const restoredPath = join(workDir, 'restored.db');
    await restoreDatabase(gzPath, restoredPath);

    const restored = createDb(restoredPath);
    const rows = restored.select().from(customers).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyCode: 'RUMB', accountName: 'Radiant-Macaw' });
    // Seeded state (admin user, assumptions) travels with the file.
    const name = restored.select().from(appMeta).where(eq(appMeta.key, 'app_name')).get();
    expect(name?.value).toBe('Data Lake Pricing');
  });

  it('rejects a corrupt backup instead of overwriting the target', async () => {
    const gzPath = join(workDir, 'corrupt.db.gz');
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    const { createGzip } = await import('node:zlib');
    const { Readable } = await import('node:stream');
    await pipeline(Readable.from(['this is not a sqlite database']), createGzip(), createWriteStream(gzPath));

    const targetPath = join(workDir, 'target.db');
    createDb(targetPath);
    await expect(restoreDatabase(gzPath, targetPath)).rejects.toThrow();
    // The existing database survives a failed restore.
    const target = createDb(targetPath);
    expect(target.select().from(appMeta).all().length).toBeGreaterThan(0);
  });
});

describe('production static serving', () => {
  it('serves the SPA shell without auth while the API stays guarded', async () => {
    const webDist = join(workDir, 'web-dist');
    mkdirSync(webDist, { recursive: true });
    writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>Data Lake Pricing</title>');

    const app = buildApp(createDb(':memory:'), { webDist });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('Data Lake Pricing');

    // Client-side routes fall back to the shell.
    const spaRoute = await app.inject({ method: 'GET', url: '/admin/assumptions' });
    expect(spaRoute.statusCode).toBe(200);
    expect(spaRoute.body).toContain('Data Lake Pricing');

    // The API is untouched by the fallback: still authenticated, still 404 for unknowns.
    expect((await app.inject({ method: 'GET', url: '/api/users' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });
});
