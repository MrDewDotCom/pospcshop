import type { FastifyInstance } from 'fastify';
import { dashboardOwnerSchema, dashboardQuerySchema, dashboardStaffSchema } from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { getDashboardSummary } from './service';

// Q13: staff get activity only; the staff schema has no money fields at all.
const schemas = { owner: dashboardOwnerSchema, staff: dashboardStaffSchema };

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/dashboard/summary',
    { schema: { querystring: dashboardQuerySchema } },
    async (request) =>
      respondByRole(
        request,
        schemas,
        getDashboardSummary(app.database.db, request.user!.id, request.query),
      ),
  );
}
