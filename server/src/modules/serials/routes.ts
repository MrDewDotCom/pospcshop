import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  SERIAL_STATUSES,
  idParamSchema,
  listSerialsQuerySchema,
  serialItemOwnerSchema,
  serialItemStaffSchema,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { listProductSerials, listSerials } from './service';

// Units carry their actual cost; staff get them without it.
const listSchemas = {
  owner: z.object({ items: z.array(serialItemOwnerSchema), total: z.number() }),
  staff: z.object({ items: z.array(serialItemStaffSchema), total: z.number() }),
};

export async function serialRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;

  r.get('/api/serials', { schema: { querystring: listSerialsQuerySchema } }, async (request) =>
    respondByRole(request, listSchemas, listSerials(db(), request.query)),
  );

  r.get(
    '/api/products/:id/serials',
    {
      schema: {
        params: idParamSchema,
        querystring: z.object({ status: z.enum(SERIAL_STATUSES).optional() }),
      },
    },
    async (request) => {
      const items = listProductSerials(db(), request.params.id, request.query.status);
      return respondByRole(request, listSchemas, { items, total: items.length });
    },
  );
}
