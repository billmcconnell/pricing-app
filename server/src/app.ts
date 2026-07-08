import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { appMeta } from './schema.js';

export function buildApp(db: Db) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/api/health', async () => {
    const row = db.select().from(appMeta).where(eq(appMeta.key, 'app_name')).get();
    return {
      status: 'ok',
      appName: row?.value ?? null,
    };
  });

  return app;
}
