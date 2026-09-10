import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  changePasswordInputSchema,
  loginInputSchema,
  permissionsFor,
  recoverInputSchema,
  type MeResponse,
  type RecoverResponse,
} from '@pcshop/shared';
import { sessions } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { tooManyRequests, unauthorized } from '../../lib/errors';
import { LoginThrottle } from '../../lib/loginThrottle';
import type { ZodTypeProvider } from '../../lib/zod';
import { clearSessionCookie, startSession } from '../../plugins/auth';
import { authenticate, changePassword, recoverOwnerPassword } from './service';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const throttle = new LoginThrottle();

  /** Runs `attempt` unless the key is locked out; failures count toward the lockout. */
  async function throttled<T>(key: string, attempt: () => Promise<T>): Promise<T> {
    const check = throttle.check(key);
    if (!check.allowed) {
      const minutes = Math.max(1, Math.ceil(check.retryAfterMs / 60_000));
      throw tooManyRequests(
        `ลองผิดหลายครั้งเกินไป กรุณารอประมาณ ${minutes} นาทีแล้วลองใหม่`,
        Math.ceil(check.retryAfterMs / 1000),
      );
    }
    try {
      const result = await attempt();
      throttle.reset(key);
      return result;
    } catch (error) {
      throttle.recordFailure(key);
      throw error;
    }
  }

  const me = (request: FastifyRequest): MeResponse => {
    if (!request.user) throw unauthorized();
    return { user: request.user, permissions: permissionsFor(request.user.role) };
  };

  r.post(
    '/api/auth/login',
    { config: { public: true }, schema: { body: loginInputSchema } },
    async (request, reply): Promise<MeResponse> => {
      const db = app.database.db;
      const { username, password } = request.body;
      const user = await throttled(`login|${username}|${request.ip}`, () =>
        authenticate(db, username, password),
      );
      request.sessionId = startSession(db, request, reply, user.id);
      request.user = user;
      writeAudit(db, { userId: user.id, action: 'auth.login', detail: { ip: request.ip } });
      return me(request);
    },
  );

  r.post('/api/auth/logout', { config: { public: true } }, async (request, reply) => {
    if (request.sessionId) {
      app.database.db.delete(sessions).where(eq(sessions.id, request.sessionId)).run();
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  r.get('/api/auth/me', async (request): Promise<MeResponse> => me(request));

  r.post(
    '/api/auth/change-password',
    { schema: { body: changePasswordInputSchema } },
    async (request) => {
      const { currentPassword, newPassword } = request.body;
      await changePassword(
        app.database.db,
        request.user!,
        request.sessionId,
        currentPassword,
        newPassword,
      );
      return { ok: true };
    },
  );

  r.post(
    '/api/auth/recover',
    { config: { public: true }, schema: { body: recoverInputSchema } },
    async (request): Promise<RecoverResponse> => {
      const { username, recoveryCode, newPassword } = request.body;
      const nextCode = await throttled(`recover|${request.ip}`, () =>
        recoverOwnerPassword(app.database.db, username, recoveryCode, newPassword),
      );
      return { recoveryCode: nextCode };
    },
  );
}
