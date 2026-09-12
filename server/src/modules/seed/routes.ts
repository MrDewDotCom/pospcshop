import type { FastifyInstance } from 'fastify';
import type { ClearSampleDataResult, SampleDataStatus } from '@pcshop/shared';
import { requirePermission } from '../../plugins/auth';
import { clearSampleData, sampleDataStatus } from './service';

export async function seedRoutes(app: FastifyInstance): Promise<void> {
  // Owner only: the counts say what the shop has, and clearing deletes data.
  const ownerOnly = { preHandler: requirePermission('settings.manage') };

  app.get('/api/seed/status', ownerOnly, async (): Promise<SampleDataStatus> =>
    sampleDataStatus(app.database.db),
  );

  app.post('/api/seed/clear', ownerOnly, async (request): Promise<ClearSampleDataResult> =>
    clearSampleData(app.database.db, request.user!),
  );
}
