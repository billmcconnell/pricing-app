import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';
import { parseAcv } from '../src/feeds.js';
import { assumptions, customers } from '../src/schema.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const acvCsv = readFileSync(join(fixtures, 'acv.csv'));
const spaceusedCsv = readFileSync(join(fixtures, 'spaceused.csv'));
const growthRateCsv = readFileSync(join(fixtures, 'growth-rate.csv'));

describe('parseAcv', () => {
  it('reads code, name, and ACV; picks the ACV column by header', () => {
    const { rows, errors } = parseAcv([
      ['Company Code', 'Account Name', 'Sum of ACV'],
      ['RUMB', 'Radiant-Macaw', 18525],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, companyCode: 'RUMB', accountName: 'Radiant-Macaw', acv: 18525 },
    ]);
  });

  it('accepts negative ACV (real Salesforce data) and rejects non-numeric', () => {
    const { rows, errors } = parseAcv([
      ['NEGC', 'Churned-Client', -170000],
      ['BADC', 'Bad-Client', 'n/a'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].acv).toBe(-170000);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('non-numeric ACV');
  });

  it('duplicate codes: first occurrence wins with a warning', () => {
    const { rows, warnings } = parseAcv([
      ['EVSG', 'A', 100],
      ['EVSG', 'B', 200],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].acv).toBe(100);
    expect(warnings).toHaveLength(1);
  });
});

describe('ACV import + Proportionality Guardrail', () => {
  let db: Db;
  let app: ReturnType<typeof buildApp>;
  let adminCookie: string;

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

  type Quote = {
    listPrice: number;
    guardrail: {
      acv: number | null;
      threshold: number;
      thresholdAmount: number | null;
      triggered: boolean | null;
    };
  };

  async function quote(identifier: string): Promise<Quote> {
    const res = await app.inject({
      method: 'GET',
      url: `/api/quote?environment=${encodeURIComponent(identifier)}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as Quote;
  }

  beforeEach(async () => {
    db = createDb(':memory:');
    app = buildApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@example.com', password: 'change-me' },
    });
    adminCookie = `session=${res.cookies.find((c) => c.name === 'session')!.value}`;
    await post('/api/imports/spaceused/commit', 'spaceused.csv', spaceusedCsv);
    await post('/api/imports/growth-rate/commit', 'growth-rate.csv', growthRateCsv);
  });

  it('the workbook feed attaches ACV to 373 Customers, including ones with no Environment', async () => {
    const res = await post('/api/imports/acv/commit', 'acv.csv', acvCsv);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rowCount: number; diff: { customersCreated: string[] } };
    // 377 feed rows, 4 duplicate codes → 373 unique Customers.
    expect(body.rowCount).toBe(373);

    const all = db.select().from(customers).all();
    const withAcv = all.filter((c) => c.acv !== null);
    expect(withAcv).toHaveLength(373);

    const list = await app.inject({ method: 'GET', url: '/api/customers', headers: { cookie: adminCookie } });
    const listBody = list.json() as {
      imports: { acv: { importedAt: string; rowCount: number } | null };
      customers: { acv: number | null; environments: unknown[] }[];
    };
    expect(listBody.imports.acv?.rowCount).toBe(373);
    expect(listBody.customers.some((c) => c.acv !== null && c.environments.length === 0)).toBe(true);
  });

  it('List Price is identical with and without ACV present', async () => {
    const before = await quote('OTQV');
    expect(before.guardrail.acv).toBeNull();

    await post('/api/imports/acv/commit', 'acv.csv', acvCsv);
    const after = await quote('OTQV');
    expect(after.listPrice).toBe(before.listPrice);
    expect(after.listPrice).toBe(112000);
  });

  it('warns when List Price > threshold × ACV; stays quiet otherwise', async () => {
    // OTQV prices at $112,000; threshold 25% ⇒ warning boundary at ACV $448,000.
    await post('/api/imports/acv/commit', 'acv.csv', 'Company Code,Account Name,Sum of ACV\nOTQV,Otter-Quay,400000\nHCTV,High-Tower,10000000\n');

    const flagged = await quote('OTQV');
    expect(flagged.guardrail).toEqual({
      acv: 400000,
      threshold: 0.25,
      thresholdAmount: 100000,
      triggered: true,
    });

    const quiet = await quote('HCTV');
    expect(quiet.guardrail.triggered).toBe(false);
  });

  it('unknown ACV is a quiet null, not a warning or an error', async () => {
    const q = await quote('OTQV');
    expect(q.guardrail).toEqual({ acv: null, threshold: 0.25, thresholdAmount: null, triggered: null });
  });

  it('changing the threshold Assumption changes warning behavior without re-import', async () => {
    await post('/api/imports/acv/commit', 'acv.csv', 'Company Code,Account Name,Sum of ACV\nOTQV,Otter-Quay,500000\n');
    // At 25%: 125,000 ≥ 112,000 — no warning.
    expect((await quote('OTQV')).guardrail.triggered).toBe(false);

    db.update(assumptions).set({ value: 0.1 }).where(eq(assumptions.key, 'guardrail_acv_share')).run();
    // At 10%: 50,000 < 112,000 — warns, no re-import needed.
    const q = await quote('OTQV');
    expect(q.guardrail.triggered).toBe(true);
    expect(q.guardrail.thresholdAmount).toBe(50000);
    expect(q.listPrice).toBe(112000); // and the price itself never moved
  });

  it('requires admin for the import; the guardrail shows for Sales too', async () => {
    const { payload, headers } = multipart('acv.csv', acvCsv);
    const unauth = await app.inject({ method: 'POST', url: '/api/imports/acv/commit', headers, payload });
    expect(unauth.statusCode).toBe(401);

    await post('/api/imports/acv/commit', 'acv.csv', 'Company Code,Account Name,Sum of ACV\nOTQV,Otter-Quay,100000\n');
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie },
      payload: { email: 'sales@example.com', password: 'pw123456', role: 'sales' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'sales@example.com', password: 'pw123456' },
    });
    const salesCookie = `session=${loginRes.cookies.find((c) => c.name === 'session')!.value}`;
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=OTQV',
      headers: { cookie: salesCookie },
    });
    const body = res.json() as Quote & { breakdown?: unknown };
    expect(body.guardrail.triggered).toBe(true);
    expect(body.breakdown).toBeUndefined();
  });
});
