import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';

const ADMIN = { email: 'admin@example.com', password: 'change-me' };

let db: Db;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = buildApp(db);
});

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'session');
  expect(cookie).toBeDefined();
  return `session=${cookie!.value}`;
}

async function createUser(
  adminCookie: string,
  user: { email: string; password: string; role: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { cookie: adminCookie },
    payload: user,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: number };
}

describe('authentication', () => {
  it('seeds an admin user that can log in', async () => {
    const cookie = await login(ADMIN.email, ADMIN.password);
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: ADMIN.email, role: 'admin' });
  });

  it('rejects bad credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN.email, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unauthenticated requests to app endpoints', async () => {
    for (const [method, url] of [
      ['GET', '/api/auth/me'],
      ['GET', '/api/users'],
      ['POST', '/api/users'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('leaves the health endpoint open for deployment probes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('logout invalidates the session', async () => {
    const cookie = await login(ADMIN.email, ADMIN.password);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe('role boundary', () => {
  it('a Sales user gets 403 on admin-only endpoints', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    await createUser(adminCookie, { email: 'sales@example.com', password: 'pw123456', role: 'sales' });
    const salesCookie = await login('sales@example.com', 'pw123456');

    for (const [method, url] of [
      ['GET', '/api/users'],
      ['POST', '/api/users'],
      ['PATCH', '/api/users/1'],
    ] as const) {
      const res = await app.inject({ method, url, headers: { cookie: salesCookie } });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('a Sales user can still use non-admin endpoints', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    await createUser(adminCookie, { email: 'sales@example.com', password: 'pw123456', role: 'sales' });
    const salesCookie = await login('sales@example.com', 'pw123456');
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: salesCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'sales' });
  });
});

describe('user management', () => {
  it('admin can create users of either role', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    await createUser(adminCookie, { email: 's@example.com', password: 'pw123456', role: 'sales' });
    await createUser(adminCookie, { email: 'a@example.com', password: 'pw123456', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: adminCookie } });
    const emails = (res.json() as { email: string }[]).map((u) => u.email).sort();
    expect(emails).toEqual(['a@example.com', 'admin@example.com', 's@example.com']);
  });

  it('rejects duplicate emails', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie },
      payload: { email: ADMIN.email, password: 'pw123456', role: 'sales' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('disabling a user blocks login and kills existing sessions', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    const { id } = await createUser(adminCookie, {
      email: 'sales@example.com',
      password: 'pw123456',
      role: 'sales',
    });
    const salesCookie = await login('sales@example.com', 'pw123456');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      headers: { cookie: adminCookie },
      payload: { disabled: true },
    });
    expect(patch.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: salesCookie } });
    expect(me.statusCode).toBe(401);

    const relogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'sales@example.com', password: 'pw123456' },
    });
    expect(relogin.statusCode).toBe(401);
  });

  it('an admin cannot disable their own account', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: adminCookie } });
    const { id } = me.json() as { id: number };
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      headers: { cookie: adminCookie },
      payload: { disabled: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('password reset takes effect and revokes old sessions', async () => {
    const adminCookie = await login(ADMIN.email, ADMIN.password);
    const { id } = await createUser(adminCookie, {
      email: 'sales@example.com',
      password: 'old-pw-123',
      role: 'sales',
    });
    const salesCookie = await login('sales@example.com', 'old-pw-123');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/users/${id}`,
      headers: { cookie: adminCookie },
      payload: { password: 'new-pw-456' },
    });
    expect(patch.statusCode).toBe(200);

    const stale = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: salesCookie } });
    expect(stale.statusCode).toBe(401);

    const oldPw = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'sales@example.com', password: 'old-pw-123' },
    });
    expect(oldPw.statusCode).toBe(401);

    await login('sales@example.com', 'new-pw-456');
  });
});
