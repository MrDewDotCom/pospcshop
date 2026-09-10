import type { FastifyInstance } from 'fastify';
import {
  permissionsFor,
  setupInputSchema,
  type SetupResponse,
  type SetupStatusResponse,
} from '@pcshop/shared';
import { shopSettings } from '../../db/schema';
import type { ZodTypeProvider } from '../../lib/zod';
import { startSession } from '../../plugins/auth';
import { needsSetup, performSetup } from './service';

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/setup/status',
    { config: { public: true } },
    async (): Promise<SetupStatusResponse> => {
      const db = app.database.db;
      const settings = db.select({ shopName: shopSettings.shopName }).from(shopSettings).get();
      return { needsSetup: needsSetup(db), shopName: settings?.shopName ?? null };
    },
  );

  r.post(
    '/api/setup',
    { config: { public: true }, schema: { body: setupInputSchema } },
    async (request, reply): Promise<SetupResponse> => {
      const db = app.database.db;
      const { user, recoveryCode } = await performSetup(db, request.body);
      startSession(db, request, reply, user.id);
      return { user, permissions: permissionsFor(user.role), recoveryCode };
    },
  );
}
