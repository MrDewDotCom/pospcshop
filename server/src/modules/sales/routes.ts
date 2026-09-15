import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  checkoutInputSchema,
  idParamSchema,
  listSalesQuerySchema,
  saleListItemOwnerSchema,
  saleListItemStaffSchema,
  saleOwnerSchema,
  saleStaffSchema,
  voidInputSchema,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import { listSales } from './queries';
import { checkout, getSale, voidSale } from './service';

// Staff see what the customer paid, never cost or profit.
const detailSchemas = { owner: saleOwnerSchema, staff: saleStaffSchema };
const listSchemas = {
  owner: z.object({ items: z.array(saleListItemOwnerSchema), total: z.number() }),
  staff: z.object({ items: z.array(saleListItemStaffSchema), total: z.number() }),
};

export async function saleRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;

  r.get('/api/sales', { schema: { querystring: listSalesQuerySchema } }, async (request) => {
    const { mine, ...query } = request.query;
    return respondByRole(
      request,
      listSchemas,
      listSales(db(), query, mine ? { salespersonId: request.user!.id } : {}),
    );
  });

  r.get('/api/sales/:id', { schema: { params: idParamSchema } }, async (request) =>
    respondByRole(request, detailSchemas, getSale(db(), request.params.id)),
  );

  r.post(
    '/api/sales/:id/void',
    {
      preHandler: requirePermission('sale.void'),
      schema: { params: idParamSchema, body: voidInputSchema },
    },
    async (request) =>
      respondByRole(
        request,
        detailSchemas,
        voidSale(db(), request.user!, request.params.id, request.body),
      ),
  );

  // Confirm checkout: sale + payment + stock out in one transaction.
  r.post(
    '/api/sales',
    { preHandler: requirePermission('sale.create'), schema: { body: checkoutInputSchema } },
    async (request, reply) =>
      reply
        .code(201)
        .send(respondByRole(request, detailSchemas, checkout(db(), request.user!, request.body))),
  );
}
