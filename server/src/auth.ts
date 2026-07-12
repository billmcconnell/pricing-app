import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Db } from './db.js';
import { sessions, users, type User } from './schema.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

export function createSession(db: Db, userId: number): string {
  const token = randomBytes(32).toString('hex');
  db.insert(sessions)
    .values({ token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    .run();
  return token;
}

export function destroySession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

export function destroyUserSessions(db: Db, userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function userForSession(db: Db, token: string): User | null {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .get();
  if (!row || row.user.disabled) return null;
  return row.user;
}
