// Session authentication (PLAN.md §8.1).
// - Cookie "sid" holds a random token; the DB stores only its sha256 (sessions.id).
// - Every /api and /uploads route requires a logged-in user unless the route sets `config: { public: true }`.
// - Non-GET API requests must carry the X-PCShop: 1 header (CSRF guard; other sites can't set it).

import fastifyCookie from '@fastify/cookie';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { and, eq, lt, ne } from 'drizzle-orm';
import { can, type Permission, type SessionUser } from '@pcshop/shared';
import type { AppDatabase } from '../db/client';
import { sessions, users } from '../db/schema';
import { forbidden, unauthorized } from '../lib/errors';
import { generateToken, hashToken } from '../lib/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
  }
  interface FastifyContextConfig {
    /** Route is reachable without logging in. */
    public?: boolean;
  }
}

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Sliding expiry is refreshed at most this often, to avoid a DB write on every request. */
const SESSION_REFRESH_MS = 5 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-pcshop';

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // The shop LAN uses plain http, so the cookie can't be marked Secure.
    secure: false,
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Creates a session for `userId`, sets the cookie, and returns the session id (token hash). */
export function startSession(
  db: AppDatabase,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: number,
): string {
  const token = generateToken();
  const id = hashToken(token);
  const now = Date.now();
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run(); // opportunistic cleanup
  db.insert(sessions)
    .values({
      id,
      userId,
      lastSeenAt: now,
      expiresAt: now + SESSION_TTL_MS,
      userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
      ip: request.ip,
    })
    .run();
  setSessionCookie(reply, token);
  return id;
}

/** Deletes all sessions of a user, optionally keeping one (e.g. the current one). */
export function endUserSessions(
  db: Pick<AppDatabase, 'delete'>,
  userId: number,
  keepSessionId?: string,
): void {
  const sessionsOfUser = eq(sessions.userId, userId);
  db.delete(sessions)
    .where(keepSessionId ? and(sessionsOfUser, ne(sessions.id, keepSessionId)) : sessionsOfUser)
    .run();
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request, reply) => {
    const isApi = request.url.startsWith('/api/');
    const isProtectedPath = isApi || request.url.startsWith('/uploads/');

    if (isApi && !SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== '1') {
      throw forbidden('CSRF_CHECK_FAILED', 'คำขอไม่ถูกต้อง กรุณาโหลดหน้าเว็บใหม่');
    }

    const token = request.cookies[SESSION_COOKIE];
    if (token) loadSession(app.database.db, request, reply, token);

    const isPublic = request.routeOptions.config?.public === true;
    if (isProtectedPath && !isPublic && !request.is404 && !request.user) {
      throw unauthorized();
    }
  });
}

function loadSession(
  db: AppDatabase,
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  const id = hashToken(token);
  const row = db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();

  const now = Date.now();
  if (!row || row.expiresAt <= now || !row.isActive) {
    if (row) db.delete(sessions).where(eq(sessions.id, id)).run();
    clearSessionCookie(reply);
    return;
  }

  request.user = { id: row.userId, name: row.name, username: row.username, role: row.role };
  request.sessionId = row.sessionId;

  if (now - row.lastSeenAt > SESSION_REFRESH_MS) {
    db.update(sessions)
      .set({ lastSeenAt: now, expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.id, id))
      .run();
    setSessionCookie(reply, token);
  }
}

/** preHandler that allows the request only if the user's role has `permission`. */
export function requirePermission(permission: Permission): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!request.user) throw unauthorized();
    if (!can(request.user.role, permission)) throw forbidden();
  };
}
