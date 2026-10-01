import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';
import { parseGrowthRate } from '../src/feeds.js';
import { assumptions, environments } from '../src/schema.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const growthRateCsv = readFileSync(join(fixtures, 'growth-rate.csv'));
const spaceusedCsv = readFileSync(join(fixtures, 'spaceused.csv'));

describe('parseGrowthRate', () => {
  it('reads two-column identifier + ratio input without a header', () => {
    const { rows, errors } = parseGrowthRate([['PKNM', 98.24]]);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ line: 1, identifier: 'PKNM', growthRate: 98.24 }]);
  });

  it('a full workbook-sheet export reads the raw Growth rate column, not size or the floored column', () => {
    const { rows } = parseGrowthRate([
      ['Client Env', 'SaaS DB size', 'with uplift', 'Growth rate', 'Growth rate floor'],
      ['PUAF', 146.13, 3264.54, 21.34, 21.34],
      ['GVTI', 1601.08, 16154.9, 0.09, 0.3],
    ]);
    expect(rows).toEqual([
      { line: 2, identifier: 'PUAF', growthRate: 21.34 },
      { line: 3, identifier: 'GVTI', growthRate: 0.09 },
    ]);
  });

  it('rejects non-numeric and negative rates per row', () => {
    const { rows, errors } = parseGrowthRate([
      ['OKAY', 0.2],
      ['BADV', 'high'],
      ['NEGV', -0.1],
    ]);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.identifier)).toEqual(['BADV', 'NEGV']);
  });

  it('accepts zero growth and large ratios (small new databases)', () => {
    const { rows, errors } = parseGrowthRate([
      ['ZERO', 0],
      ['PKNM', 98.24],
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.growthRate)).toEqual([0, 98.24]);
  });

  it('duplicate identifiers: first occurrence wins with a warning', () => {
    const { rows, warnings } = parseGrowthRate([
      ['EVSG', 0.5],
      ['EVSG', 0.9],
    ]);
    expect(rows).toEqual([{ line: 1, identifier: 'EVSG', growthRate: 0.5 }]);
    expect(warnings).toHaveLength(1);
  });
});

describe('growth-rate import API', () => {
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

  type CustomerList = {
    growthFloor: number;
    imports: { growthRate: { rowCount: number } | null };
    customers: {
      companyCode: string;
      environments: {
        identifier: string;
        growthRate: number | null;
        effectiveGrowthRate: number;
        growthDefaulted: boolean;
      }[];
    }[];
  };

  async function customerList(): Promise<CustomerList> {
    const res = await app.inject({ method: 'GET', url: '/api/customers', headers: { cookie: adminCookie } });
    return res.json() as CustomerList;
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
  });

  it('the workbook feed attaches rates to 356 Environments; the rest default to the floor', async () => {
    const res = await post('/api/imports/growth-rate/commit', 'growth-rate.csv', growthRateCsv);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      diff: { attached: unknown[]; unknownIdentifiers: string[] };
      warnings: string[];
    };
    expect(body.diff.attached).toHaveLength(356);
    expect(body.diff.unknownIdentifiers).toEqual([]);
    expect(body.warnings).toHaveLength(2); // duplicate EVSG and CURE rows

    const withRate = db.select().from(environments).all().filter((e) => e.growthRate !== null);
    expect(withRate).toHaveLength(356);

    const list = await customerList();
    const environmentsFlat = list.customers.flatMap((c) => c.environments);
    const defaulted = environmentsFlat.filter((e) => e.growthDefaulted);
    expect(defaulted).toHaveLength(10);
    for (const env of defaulted) {
      expect(env.growthRate).toBeNull();
      expect(env.effectiveGrowthRate).toBe(0.3); // floor as the agreed default
    }
  });

  it('stores the raw ratio; the floor is applied at read time', async () => {
    await post('/api/imports/growth-rate/commit', 'growth-rate.csv', growthRateCsv);

    // GVTI's raw rate in the workbook is 9.09 — stored raw, above the floor.
    const gvti = db.select().from(environments).where(eq(environments.identifier, 'GVTI')).get()!;
    expect(gvti.growthRate).toBe(9.09);

    // A below-floor raw rate is stored raw but floored when read.
    db.update(environments).set({ growthRate: 0.05 }).where(eq(environments.identifier, 'GVTI')).run();
    let list = await customerList();
    let env = list.customers.flatMap((c) => c.environments).find((e) => e.identifier === 'GVTI')!;
    expect(env.growthRate).toBe(0.05);
    expect(env.effectiveGrowthRate).toBe(0.3);
    expect(env.growthDefaulted).toBe(false);

    // Changing the floor Assumption re-floors everyone without a re-import.
    db.update(assumptions).set({ value: 0.5 }).where(eq(assumptions.key, 'growth_floor')).run();
    list = await customerList();
    expect(list.growthFloor).toBe(0.5);
    env = list.customers.flatMap((c) => c.environments).find((e) => e.identifier === 'GVTI')!;
    expect(env.growthRate).toBe(0.05); // stored value untouched
    expect(env.effectiveGrowthRate).toBe(0.5);
  });

  it('unknown Environments are reported, known rows still commit', async () => {
    const feed = 'Client Env,Growth rate\nGVTI,1.5\nZZZZ,0.4\nAAAA_SaaS_X_PROD,0.6\n';
    const res = await post('/api/imports/growth-rate/commit', 'growth-rate.csv', feed);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { diff: { attached: unknown[]; unknownIdentifiers: string[] } };
    expect(body.diff.unknownIdentifiers).toEqual(['ZZZZ', 'AAAA_SaaS_X_PROD']);
    expect(body.diff.attached).toHaveLength(1);
    const gvti = db.select().from(environments).where(eq(environments.identifier, 'GVTI')).get()!;
    expect(gvti.growthRate).toBe(1.5);
  });

  it('a malformed row rejects the whole file', async () => {
    const feed = 'Client Env,Growth rate\nGVTI,1.5\nHUCD,bogus\n';
    const res = await post('/api/imports/growth-rate/commit', 'growth-rate.csv', feed);
    expect(res.statusCode).toBe(422);
    const gvti = db.select().from(environments).where(eq(environments.identifier, 'GVTI')).get()!;
    expect(gvti.growthRate).toBeNull();
  });

  it('requires admin', async () => {
    const { payload, headers } = multipart('growth-rate.csv', growthRateCsv);
    const res = await app.inject({ method: 'POST', url: '/api/imports/growth-rate/commit', headers, payload });
    expect(res.statusCode).toBe(401);
  });
});
