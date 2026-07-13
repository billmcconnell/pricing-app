import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadCostModelAssumptions } from '../src/assumptions.js';
import { computeCost } from '../src/costModel.js';
import { createDb, type Db } from '../src/db.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const spaceusedCsv = readFileSync(join(fixtures, 'spaceused.csv'));
const growthRateCsv = readFileSync(join(fixtures, 'growth-rate.csv'));
const accountNamesCsv = readFileSync(join(fixtures, 'account-names.csv'));

let db: Db;
let app: ReturnType<typeof buildApp>;
let adminCookie: string;
let salesCookie: string;

function multipart(filename: string, content: Buffer) {
  const boundary = '----vitestboundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function login(email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  return `session=${res.cookies.find((c) => c.name === 'session')!.value}`;
}

beforeEach(async () => {
  db = createDb(':memory:');
  app = buildApp(db);
  adminCookie = await login('admin@example.com', 'change-me');
  for (const [feed, content] of [
    ['spaceused', spaceusedCsv],
    ['growth-rate', growthRateCsv],
    ['account-names', accountNamesCsv],
  ] as const) {
    const { payload, headers } = multipart(`${feed}.csv`, content);
    await app.inject({
      method: 'POST',
      url: `/api/imports/${feed}/commit`,
      headers: { ...headers, cookie: adminCookie },
      payload,
    });
  }
  await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { cookie: adminCookie },
    payload: { email: 'sales@example.com', password: 'pw123456', role: 'sales' },
  });
  salesCookie = await login('sales@example.com', 'pw123456');
});

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

const COST_INTERNALS = [
  'opex',
  'grossMargin',
  'contingency',
  'fixedCosts',
  'variableCosts',
  'snowflakeCredits',
  'breakdown',
];

describe('GET /api/quote/customers', () => {
  it('requires authentication but is available to Sales', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/quote/customers' })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote/customers',
      headers: { cookie: salesCookie },
    });
    expect(res.statusCode).toBe(200);
  });

  it('lists Customers searchable by code or name, including unpriceable ones', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote/customers',
      headers: { cookie: salesCookie },
    });
    const body = res.json() as {
      companyCode: string;
      accountName: string | null;
      environments: unknown[];
    }[];
    // Both lookup keys are present for the UI search.
    const rumb = body.find((c) => c.companyCode === 'RUMB')!;
    expect(rumb.accountName).toBe('Radiant-Macaw');
    // Unpriceable Customers (no measured Environment) are in the list.
    expect(body.some((c) => c.environments.length === 0)).toBe(true);
  });

  it('exposes no cost internals to Sales', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote/customers',
      headers: { cookie: salesCookie },
    });
    const keys = collectKeys(res.json());
    for (const key of COST_INTERNALS) expect(keys.has(key), key).toBe(false);
  });
});

describe('GET /api/quote', () => {
  it('prices an Environment exactly as the cost-model engine does', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=OTQV',
      headers: { cookie: salesCookie },
    });
    expect(res.statusCode).toBe(200);
    const quote = res.json() as {
      listPrice: number;
      dbSizeGb: number;
      effectiveGrowthRate: number;
      grownSizeGb: number;
    };

    const expected = computeCost(
      { dbSizeGb: quote.dbSizeGb, growthRate: 0.3 },
      loadCostModelAssumptions(db),
    );
    expect(quote.dbSizeGb).toBeCloseTo(1003.4833, 6);
    expect(quote.effectiveGrowthRate).toBe(0.3);
    expect(quote.grownSizeGb).toBeCloseTo(expected.grownSizeGb, 9);
    expect(quote.listPrice).toBe(expected.listPrice);
    expect(quote.listPrice).toBe(112000); // known value from the issue-03 workbook fixture
  });

  it('MOLH-style Customers price each Environment separately', async () => {
    const quotes = await Promise.all(
      ['MOLH_imos_MPCC_PROD', 'MOLH_imos_MOLDB_prod'].map(async (identifier) => {
        const res = await app.inject({
          method: 'GET',
          url: `/api/quote?environment=${encodeURIComponent(identifier)}`,
          headers: { cookie: salesCookie },
        });
        expect(res.statusCode).toBe(200);
        return res.json() as {
          identifier: string;
          companyCode: string;
          dbSizeGb: number;
          listPrice: number;
        };
      }),
    );
    expect(quotes[0].dbSizeGb).not.toBe(quotes[1].dbSizeGb);
    expect(quotes.map((q) => q.companyCode)).toEqual(['MOLH', 'MOLH']);
  });

  it('an Environment with no imported Growth Rate prices at the floor, marked defaulted', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/quote/customers',
      headers: { cookie: salesCookie },
    });
    const body = list.json() as {
      environments: { identifier: string; growthDefaulted: boolean }[];
    }[];
    const defaulted = body.flatMap((c) => c.environments).find((e) => e.growthDefaulted)!;
    expect(defaulted).toBeDefined();

    const res = await app.inject({
      method: 'GET',
      url: `/api/quote?environment=${encodeURIComponent(defaulted.identifier)}`,
      headers: { cookie: salesCookie },
    });
    const quote = res.json() as {
      growthRate: number | null;
      effectiveGrowthRate: number;
      growthDefaulted: boolean;
    };
    expect(quote.growthRate).toBeNull();
    expect(quote.effectiveGrowthRate).toBe(0.3);
    expect(quote.growthDefaulted).toBe(true);
  });

  it('Sales payload contains no OPEX/margin/contingency fields anywhere', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=OTQV',
      headers: { cookie: salesCookie },
    });
    const keys = collectKeys(res.json());
    for (const key of COST_INTERNALS) expect(keys.has(key), key).toBe(false);
    expect(keys.has('listPrice')).toBe(true);
  });

  it('Admin gets the same quote plus the full breakdown', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=OTQV',
      headers: { cookie: adminCookie },
    });
    const body = res.json() as {
      listPrice: number;
      breakdown: { opex: number; grossMargin: number };
    };
    expect(body.listPrice).toBe(112000);
    expect(body.breakdown.opex).toBeCloseTo(44617.963214242, 5);
    expect(body.breakdown.grossMargin).toBe(0.6);
  });

  it('includes a Multi-Year Projection (default 5 years) whose year 1 matches the quote', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=OTQV',
      headers: { cookie: salesCookie },
    });
    const body = res.json() as {
      listPrice: number;
      grownSizeGb: number;
      projection: {
        years: { year: number; projectedSizeGb: number; listPrice: number }[];
        totalListPrice: number;
      };
    };
    expect(body.projection.years).toHaveLength(5);
    expect(body.projection.years[0].projectedSizeGb).toBeCloseTo(body.grownSizeGb, 9);
    expect(body.projection.years[0].listPrice).toBe(body.listPrice);
    expect(body.projection.totalListPrice).toBe(
      body.projection.years.reduce((sum, y) => sum + y.listPrice, 0),
    );
    // Sales projection rows carry size and price only.
    const keys = collectKeys(body.projection);
    for (const key of ['opex', 'creditsPerMonth', ...COST_INTERNALS]) {
      expect(keys.has(key), key).toBe(false);
    }
  });

  it('honors the years parameter and validates it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=OTQV&years=8',
      headers: { cookie: salesCookie },
    });
    const body = res.json() as { projection: { years: unknown[] } };
    expect(body.projection.years).toHaveLength(8);

    for (const bad of ['0', '31', '2.5', 'ten']) {
      const invalid = await app.inject({
        method: 'GET',
        url: `/api/quote?environment=OTQV&years=${bad}`,
        headers: { cookie: salesCookie },
      });
      expect(invalid.statusCode, `years=${bad}`).toBe(400);
    }
  });

  it('unknown Environment is a 404, missing parameter a 400', async () => {
    const unknown = await app.inject({
      method: 'GET',
      url: '/api/quote?environment=NOPE',
      headers: { cookie: salesCookie },
    });
    expect(unknown.statusCode).toBe(404);
    const missing = await app.inject({ method: 'GET', url: '/api/quote', headers: { cookie: salesCookie } });
    expect(missing.statusCode).toBe(400);
  });
});
