import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';
import { assumptions } from '../src/schema.js';

let db: Db;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = buildApp(db);
});

async function loginAdmin(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'admin@example.com', password: 'change-me' },
  });
  return `session=${res.cookies.find((c) => c.name === 'session')!.value}`;
}

const COMPUTE_URL = '/api/cost-model/compute?dbSizeGb=1003.4833&growthRate=0.3';

describe('GET /api/cost-model/compute', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: COMPUTE_URL });
    expect(res.statusCode).toBe(401);
  });

  it('is admin-only: Sales gets 403', async () => {
    const adminCookie = await loginAdmin();
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
    const res = await app.inject({ method: 'GET', url: COMPUTE_URL, headers: { cookie: salesCookie } });
    expect(res.statusCode).toBe(403);
  });

  it('computes the breakdown from seeded Assumptions (OTQV workbook fixture)', async () => {
    const cookie = await loginAdmin();
    const res = await app.inject({ method: 'GET', url: COMPUTE_URL, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { opex: number; listPrice: number };
    expect(body.opex).toBeCloseTo(44617.963214242, 5);
    expect(body.listPrice).toBe(112000);
  });

  it('rejects invalid inputs', async () => {
    const cookie = await loginAdmin();
    for (const qs of ['dbSizeGb=abc&growthRate=0.3', 'dbSizeGb=-5&growthRate=0.3', 'dbSizeGb=100']) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/cost-model/compute?${qs}`,
        headers: { cookie },
      });
      expect(res.statusCode, qs).toBe(400);
    }
  });

  it('reads Assumptions from the database at compute time — an edit changes the next computation', async () => {
    const cookie = await loginAdmin();
    const before = (
      await app.inject({ method: 'GET', url: COMPUTE_URL, headers: { cookie } })
    ).json() as { opex: number; listPrice: number };

    db.update(assumptions).set({ value: 0.5 }).where(eq(assumptions.key, 'gross_margin')).run();

    const after = (
      await app.inject({ method: 'GET', url: COMPUTE_URL, headers: { cookie } })
    ).json() as { opex: number; listPrice: number };

    expect(after.opex).toBeCloseTo(before.opex, 6);
    // 50% margin ⇒ OPEX × 2 instead of × 2.5
    expect(after.listPrice).toBe(Math.ceil((after.opex * 2) / 500) * 500);
    expect(after.listPrice).toBeLessThan(before.listPrice);
  });
});
