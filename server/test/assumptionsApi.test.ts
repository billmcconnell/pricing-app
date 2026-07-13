import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ASSUMPTION_SEEDS } from '../src/assumptions.js';
import { createDb, type Db } from '../src/db.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const spaceusedCsv = readFileSync(join(fixtures, 'spaceused.csv'));
const growthRateCsv = readFileSync(join(fixtures, 'growth-rate.csv'));

let db: Db;
let app: ReturnType<typeof buildApp>;
let adminCookie: string;

async function login(email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  return `session=${res.cookies.find((c) => c.name === 'session')!.value}`;
}

async function patchAssumption(key: string, value: number, cookie = adminCookie) {
  return app.inject({
    method: 'PATCH',
    url: `/api/assumptions/${key}`,
    headers: { cookie },
    payload: { value },
  });
}

beforeEach(async () => {
  db = createDb(':memory:');
  app = buildApp(db);
  adminCookie = await login('admin@example.com', 'change-me');
});

describe('assumptions endpoints', () => {
  it('are admin-only', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie },
      payload: { email: 'sales@example.com', password: 'pw123456', role: 'sales' },
    });
    const salesCookie = await login('sales@example.com', 'pw123456');
    for (const [method, url] of [
      ['GET', '/api/assumptions'],
      ['GET', '/api/assumptions/changes'],
      ['PATCH', '/api/assumptions/gross_margin'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url} unauth`).toBe(401);
      const res = await app.inject({ method, url, headers: { cookie: salesCookie } });
      expect(res.statusCode, `${method} ${url} sales`).toBe(403);
    }
  });

  it('lists every seeded Assumption with label, category, and unit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/assumptions', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { key: string; label: string; category: string; unit: string | null }[];
    expect(body).toHaveLength(ASSUMPTION_SEEDS.length);
    for (const seed of ASSUMPTION_SEEDS) {
      const row = body.find((a) => a.key === seed.key)!;
      expect(row, seed.key).toBeDefined();
      expect(row.label).toBe(seed.label);
      expect(row.category).toBe(seed.category);
    }
    expect(new Set(body.map((a) => a.category))).toEqual(
      new Set(['unit-cost', 'behavioral', 'commercial']),
    );
  });

  it('edit → recompute → change log, end to end', async () => {
    // Import real data so quotes are live.
    const boundary = '----vitestboundary';
    for (const [feed, content] of [
      ['spaceused', spaceusedCsv],
      ['growth-rate', growthRateCsv],
    ] as const) {
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${feed}.csv"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      await app.inject({
        method: 'POST',
        url: `/api/imports/${feed}/commit`,
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: adminCookie },
        payload,
      });
    }

    const before = (
      await app.inject({ method: 'GET', url: '/api/quote?environment=OTQV', headers: { cookie: adminCookie } })
    ).json() as { listPrice: number };
    expect(before.listPrice).toBe(112000);

    const patch = await patchAssumption('gross_margin', 0.5);
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { value: number }).value).toBe(0.5);

    // Takes effect on the very next computation — OPEX × 2 instead of × 2.5.
    const after = (
      await app.inject({ method: 'GET', url: '/api/quote?environment=OTQV', headers: { cookie: adminCookie } })
    ).json() as { listPrice: number };
    expect(after.listPrice).toBe(89500);

    const changes = (
      await app.inject({ method: 'GET', url: '/api/assumptions/changes', headers: { cookie: adminCookie } })
    ).json() as { key: string; label: string; oldValue: number; newValue: number; changedBy: string; changedAt: string }[];
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      key: 'gross_margin',
      oldValue: 0.6,
      newValue: 0.5,
      changedBy: 'admin@example.com',
    });
    expect(changes[0].label).toContain('Gross margin');
    expect(new Date(changes[0].changedAt).getTime()).toBeGreaterThan(0);
  });

  it('orders the change log newest first', async () => {
    await patchAssumption('contingency_rate', 0.15);
    await patchAssumption('price_floor', 35000);
    await patchAssumption('contingency_rate', 0.2);
    const changes = (
      await app.inject({ method: 'GET', url: '/api/assumptions/changes', headers: { cookie: adminCookie } })
    ).json() as { key: string; oldValue: number; newValue: number }[];
    expect(changes.map((c) => c.key)).toEqual(['contingency_rate', 'price_floor', 'contingency_rate']);
    expect(changes[0]).toMatchObject({ oldValue: 0.15, newValue: 0.2 });
  });

  it('a same-value save is a no-op with no log entry', async () => {
    const res = await patchAssumption('price_floor', 30000);
    expect(res.statusCode).toBe(200);
    const changes = (
      await app.inject({ method: 'GET', url: '/api/assumptions/changes', headers: { cookie: adminCookie } })
    ).json() as unknown[];
    expect(changes).toHaveLength(0);
  });

  it('validates edits', async () => {
    const cases: [string, number, string][] = [
      ['gross_margin', 1, 'below 1'],
      ['gross_margin', -0.1, 'below 1'],
      ['contingency_rate', 1.2, 'between 0 and 1'],
      ['growth_floor', -0.3, 'between 0 and 1'],
      ['snowflake_credit_price', -1, 'not be negative'],
      ['price_rounding', 0, 'greater than 0'],
      ['dms_tasks_per_instance', 0, 'greater than 0'],
      ['credit_tier_3_over_gb', 80, 'strictly increasing'], // below tier 2's 90
      ['credit_tier_2_over_gb', 160, 'strictly increasing'], // above tier 3's 150
    ];
    for (const [key, value, fragment] of cases) {
      const res = await patchAssumption(key, value);
      expect(res.statusCode, `${key}=${value}`).toBe(400);
      expect((res.json() as { error: string }).error, `${key}=${value}`).toContain(fragment);
    }

    // A consistent tier reshuffle is allowed when done in a valid order.
    expect((await patchAssumption('credit_tier_4_over_gb', 250)).statusCode).toBe(200);
    expect((await patchAssumption('credit_tier_3_over_gb', 200)).statusCode).toBe(200);

    const unknown = await patchAssumption('not_a_key', 1);
    expect(unknown.statusCode).toBe(404);

    const notNumber = await app.inject({
      method: 'PATCH',
      url: '/api/assumptions/price_floor',
      headers: { cookie: adminCookie },
      payload: { value: 'thirty' },
    });
    expect(notNumber.statusCode).toBe(400);
  });
});
