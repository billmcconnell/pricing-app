import cookie from '@fastify/cookie';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { loadCostModelAssumptions } from './assumptions.js';
import {
  createSession,
  destroySession,
  destroyUserSessions,
  hashPassword,
  userForSession,
  verifyPassword,
} from './auth.js';
import { computeCost } from './costModel.js';
import type { Db } from './db.js';
import { appMeta, users, type User } from './schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const SESSION_COOKIE = 'session';
// Login must be reachable to authenticate; health stays open for deployment probes.
const PUBLIC_ROUTES = new Set(['/api/health', '/api/auth/login']);

function toPublicUser(user: User) {
  return { id: user.id, email: user.email, role: user.role, disabled: user.disabled };
}

export function buildApp(db: Db) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.register(cookie);
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.routeOptions.url && PUBLIC_ROUTES.has(req.routeOptions.url)) return;
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? userForSession(db, token) : null;
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    req.user = user;
  });

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden' });
    }
  };

  app.get('/api/health', async () => {
    const row = db.select().from(appMeta).where(eq(appMeta.key, 'app_name')).get();
    return {
      status: 'ok',
      appName: row?.value ?? null,
    };
  });

  app.post<{ Body: { email?: string; password?: string } }>(
    '/api/auth/login',
    async (req, reply) => {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return reply.code(400).send({ error: 'email and password are required' });
      }
      const user = db.select().from(users).where(eq(users.email, email)).get();
      if (!user || user.disabled || !verifyPassword(password, user.passwordHash)) {
        return reply.code(401).send({ error: 'invalid credentials' });
      }
      const token = createSession(db, user.id);
      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
      return toPublicUser(user);
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) destroySession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => toPublicUser(req.user!));

  // Full cost breakdown (OPEX, margin, contingency) is Admin-only; the Sales-facing
  // quote screen (issue 06) will expose List Price without the internals.
  app.get<{ Querystring: { dbSizeGb?: string; growthRate?: string } }>(
    '/api/cost-model/compute',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const dbSizeGb = Number(req.query.dbSizeGb);
      const growthRate = Number(req.query.growthRate);
      if (!Number.isFinite(dbSizeGb) || dbSizeGb < 0) {
        return reply.code(400).send({ error: 'dbSizeGb must be a non-negative number' });
      }
      if (!Number.isFinite(growthRate) || growthRate < 0) {
        return reply.code(400).send({ error: 'growthRate must be a non-negative number' });
      }
      const a = loadCostModelAssumptions(db);
      return computeCost({ dbSizeGb, growthRate }, a);
    },
  );

  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db.select().from(users).all().map(toPublicUser);
  });

  app.post<{ Body: { email?: string; password?: string; role?: string } }>(
    '/api/users',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { email, password, role } = req.body ?? {};
      if (!email || !password || (role !== 'sales' && role !== 'admin')) {
        return reply
          .code(400)
          .send({ error: 'email, password, and role (sales or admin) are required' });
      }
      const existing = db.select().from(users).where(eq(users.email, email)).get();
      if (existing) {
        return reply.code(409).send({ error: 'a user with that email already exists' });
      }
      const created = db
        .insert(users)
        .values({ email, passwordHash: hashPassword(password), role })
        .returning()
        .get();
      return reply.code(201).send(toPublicUser(created));
    },
  );

  app.patch<{ Params: { id: string }; Body: { disabled?: boolean; password?: string } }>(
    '/api/users/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const id = Number(req.params.id);
      const target = db.select().from(users).where(eq(users.id, id)).get();
      if (!target) {
        return reply.code(404).send({ error: 'user not found' });
      }
      const { disabled, password } = req.body ?? {};
      if (disabled === undefined && password === undefined) {
        return reply.code(400).send({ error: 'nothing to update' });
      }
      if (disabled === true && id === req.user!.id) {
        return reply.code(400).send({ error: 'you cannot disable your own account' });
      }
      const updated = db
        .update(users)
        .set({
          ...(disabled !== undefined ? { disabled } : {}),
          ...(password !== undefined ? { passwordHash: hashPassword(password) } : {}),
        })
        .where(eq(users.id, id))
        .returning()
        .get();
      // Disabling or resetting a password revokes existing logins.
      if (disabled === true || password !== undefined) destroyUserSessions(db, id);
      return toPublicUser(updated);
    },
  );

  return app;
}
