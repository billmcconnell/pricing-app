import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';
import { environments } from '../src/schema.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const spaceusedCsv = readFileSync(join(fixtures, 'spaceused.csv'));
const accountNamesCsv = readFileSync(join(fixtures, 'account-names.csv'));

let db: Db;
let app: ReturnType<typeof buildApp>;
let adminCookie: string;

beforeEach(async () => {
  db = createDb(':memory:');
  app = buildApp(db);
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'admin@example.com', password: 'change-me' },
  });
  adminCookie = `session=${res.cookies.find((c) => c.name === 'session')!.value}`;
});

function multipart(filename: string, content: Buffer | string) {
  const boundary = '----vitestboundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function post(url: string, filename: string, content: Buffer | string) {
  const { payload, headers } = multipart(filename, content);
  return app.inject({ method: 'POST', url, headers: { ...headers, cookie: adminCookie }, payload });
}

type Diff = {
  created: unknown[];
  updated: { identifier: string; oldDbSizeGb: number; newDbSizeGb: number }[];
  unchangedCount: number;
  missing: string[];
};
type ImportResponse = { diff: Diff; rowCount: number; warnings: string[]; committed: boolean };

describe('spaceused import', () => {
  it('requires admin', async () => {
    const { payload, headers } = multipart('spaceused.csv', spaceusedCsv);
    const res = await app.inject({ method: 'POST', url: '/api/imports/spaceused/commit', headers, payload });
    expect(res.statusCode).toBe(401);
  });

  it('preview reports the diff without committing', async () => {
    const res = await post('/api/imports/spaceused/preview', 'spaceused.csv', spaceusedCsv);
    expect(res.statusCode).toBe(200);
    const body = res.json() as ImportResponse;
    expect(body.committed).toBe(false);
    expect(body.rowCount).toBe(366); // 367 feed rows, one duplicate EVSG
    expect(body.diff.created).toHaveLength(366);
    expect(body.warnings.some((w) => w.includes('EVSG'))).toBe(true);
    expect(db.select().from(environments).all()).toHaveLength(0);
  });

  it('commit of the workbook feed yields 366 Environments with sizes in GB', async () => {
    const res = await post('/api/imports/spaceused/commit', 'spaceused.csv', spaceusedCsv);
    expect(res.statusCode).toBe(200);
    expect((res.json() as ImportResponse).committed).toBe(true);

    const all = db.select().from(environments).all();
    expect(all).toHaveLength(366);
    // 672,758 MB row (FTQP) is stored as ≈672.8 GB — conversion at the import boundary.
    const ftqp = all.find((e) => e.identifier === 'FTQP')!;
    expect(ftqp.dbSizeGb).toBeCloseTo(672.758, 6);

    const list = await app.inject({ method: 'GET', url: '/api/customers', headers: { cookie: adminCookie } });
    const body = list.json() as {
      imports: { spaceused: { importedAt: string; rowCount: number } | null };
      customers: { companyCode: string; environments: { identifier: string; dbSizeGb: number }[] }[];
    };
    expect(body.imports.spaceused?.rowCount).toBe(366);
    expect(body.imports.spaceused?.importedAt).toBeTruthy();

    // ABCD owns two Environments, separately sized.
    const abcd = body.customers.find((c) => c.companyCode === 'ABCD')!;
    expect(abcd.environments).toHaveLength(2);
    const identifiers = abcd.environments.map((e) => e.identifier).sort();
    expect(identifiers).toEqual(['ABCD_SaaS_PROD', 'ABCD_SaaS_TEST']);
    expect(abcd.environments[0].dbSizeGb).not.toBe(abcd.environments[1].dbSizeGb);
  });

  it('re-import updates in place; vanished rows are flagged, not deleted', async () => {
    await post('/api/imports/spaceused/commit', 'spaceused.csv', spaceusedCsv);

    // Same file again: everything unchanged, no duplicates.
    const again = await post('/api/imports/spaceused/commit', 'spaceused.csv', spaceusedCsv);
    const againBody = again.json() as ImportResponse;
    expect(againBody.diff.created).toHaveLength(0);
    expect(againBody.diff.updated).toHaveLength(0);
    expect(againBody.diff.unchangedCount).toBe(366);
    expect(db.select().from(environments).all()).toHaveLength(366);

    // Modified feed: OTQV grows, FTQP disappears.
    const modified = 'Company Code,SaaS DB size\nOTQV,2000000\n';
    const res = await post('/api/imports/spaceused/commit', 'spaceused.csv', modified);
    const body = res.json() as ImportResponse;
    expect(body.diff.updated).toHaveLength(1);
    expect(body.diff.updated[0].identifier).toBe('OTQV');
    expect(body.diff.updated[0].oldDbSizeGb).toBeCloseTo(1003.4833, 6);
    expect(body.diff.updated[0].newDbSizeGb).toBe(2000);
    expect(body.diff.missing).toContain('FTQP');

    const all = db.select().from(environments).all();
    expect(all).toHaveLength(366); // nothing deleted
    expect(all.find((e) => e.identifier === 'FTQP')!.missingFromLastImport).toBe(true);
    expect(all.find((e) => e.identifier === 'OTQV')!.missingFromLastImport).toBe(false);

    // The identifier returning in a later feed clears the flag.
    await post('/api/imports/spaceused/commit', 'spaceused.csv', spaceusedCsv);
    expect(
      db.select().from(environments).all().find((e) => e.identifier === 'FTQP')!
        .missingFromLastImport,
    ).toBe(false);
  });

  it('a single malformed row rejects the whole file with a per-row report', async () => {
    const bad = 'Company Code,SaaS DB size\nOTQV,100\nBADCODE99,50\nHCTV,oops\n';
    const res = await post('/api/imports/spaceused/commit', 'spaceused.csv', bad);
    expect(res.statusCode).toBe(422);
    const body = res.json() as { errors: { line: number; message: string }[]; committed: boolean };
    expect(body.committed).toBe(false);
    expect(body.errors).toHaveLength(2);
    expect(db.select().from(environments).all()).toHaveLength(0);
  });

  it('accepts the same data as xlsx', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('spaceused');
    ws.addRow(['Company Code', 'SaaS DB size']);
    ws.addRow(['OTQV', 1003483.3]);
    ws.addRow(['ABCD_SaaS_PROD', 123456]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await post('/api/imports/spaceused/commit', 'spaceused.xlsx', buffer);
    expect(res.statusCode).toBe(200);
    const all = db.select().from(environments).all();
    expect(all).toHaveLength(2);
    expect(all.find((e) => e.identifier === 'ABCD_SaaS_PROD')!.dbSizeGb).toBeCloseTo(123.456, 6);
  });

  it('rejects unsupported file types', async () => {
    const res = await post('/api/imports/spaceused/preview', 'spaceused.pdf', 'junk');
    expect(res.statusCode).toBe(400);
  });
});

describe('account-names import', () => {
  it('attaches names to Customers and creates Customers with no Environment', async () => {
    await post('/api/imports/spaceused/commit', 'spaceused.csv', spaceusedCsv);
    const res = await post('/api/imports/account-names/commit', 'account-names.csv', accountNamesCsv);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rowCount: number; diff: { customersCreated: string[] } };
    // 378 cheat-sheet rows, 5 duplicate codes → 373 unique Customers.
    expect(body.rowCount).toBe(373);
    // Cheat sheet has more codes than the spaceused feed — those exist commercially, unpriceable.
    expect(body.diff.customersCreated.length).toBeGreaterThan(0);

    const list = await app.inject({ method: 'GET', url: '/api/customers', headers: { cookie: adminCookie } });
    const { customers: all } = list.json() as {
      customers: { companyCode: string; accountName: string | null; environments: unknown[] }[];
    };
    const withNames = all.filter((c) => c.accountName !== null);
    expect(withNames.length).toBe(373);
    const noEnv = all.filter((c) => c.environments.length === 0);
    expect(noEnv.length).toBeGreaterThan(0);
  });
});
