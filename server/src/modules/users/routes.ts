import type { FastifyInstance } from 'fastify';
import {
  createUserInputSchema,
  idParamSchema,
  resetUserPasswordInputSchema,
  updateUserInputSchema,
  type User,
} from '@pcshop/shared';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import { createUser, listUsers, resetUserPassword, updateUser } from './service';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // Applies to every route in this plugin only (Fastify encapsulation).
  app.addHook('preHandler', requirePermission('users.manage'));
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/users', async (): Promise<{ items: User[] }> => ({
    items: listUsers(app.database.db),
  }));

  r.post('/api/users', { schema: { body: createUserInputSchema } }, async (request, reply) => {
    const user = await createUser(app.database.db, request.user!, request.body);
    return reply.code(201).send(user);
  });

  r.patch(
    '/api/users/:id',
    { schema: { params: idParamSchema, body: updateUserInputSchema } },
    async (request): Promise<User> =>
      updateUser(app.database.db, request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/users/:id/reset-password',
    { schema: { params: idParamSchema, body: resetUserPasswordInputSchema } },
    async (request) => {
      await resetUserPassword(
        app.database.db,
        request.user!,
        request.params.id,
        request.body.newPassword,
      );
      return { ok: true };
    },
  );
}
