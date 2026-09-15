import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createReturnInputSchema,
  idParamSchema,
  listReturnsQuerySchema,
  resolveReturnItemInputSchema,
  returnItemParamSchema,
  returnListItemSchema,
  saleReturnOwnerSchema,
  saleReturnStaffSchema,
  updateReturnRefundInputSchema,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import { listReturns } from './queries';
import { createReturn, getReturn, resolveReturnItem, updateReturnRefund } from './service';

// Staff see refunds (they hand them over), never the cost of the returned units.
const detailSchemas = { owner: saleReturnOwnerSchema, staff: saleReturnStaffSchema };
const listSchema = z.object({ items: z.array(returnListItemSchema), total: z.number() });

export async function returnRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;

  r.get('/api/returns', { schema: { querystring: listReturnsQuerySchema } }, async (request) =>
    respondByRole(
      request,
      { owner: listSchema, staff: listSchema },
      listReturns(db(), request.query),
    ),
  );

  r.get('/api/returns/:id', { schema: { params: idParamSchema } }, async (request) =>
    respondByRole(request, detailSchemas, getReturn(db(), request.params.id)),
  );

  // Record a return: the units go into quarantine, stock doesn't change (Q8/P16).
  r.post(
    '/api/sales/:id/returns',
    {
      preHandler: requirePermission('return.create'),
      schema: { params: idParamSchema, body: createReturnInputSchema },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          respondByRole(
            request,
            detailSchemas,
            createReturn(db(), request.user!, request.params.id, request.body),
          ),
        ),
  );

  // The explicit decision that takes a returned unit out of quarantine (Q1: the only stock change).
  r.post(
    '/api/returns/:id/items/:itemId/resolve',
    {
      preHandler: requirePermission('return.resolve'),
      schema: { params: returnItemParamSchema, body: resolveReturnItemInputSchema },
    },
    async (request) =>
      respondByRole(
        request,
        detailSchemas,
        resolveReturnItem(
          db(),
          request.user!,
          request.params.id,
          request.params.itemId,
          request.body,
        ),
      ),
  );

  // P21: only the owner changes the refund amount, on its own endpoint.
  r.patch(
    '/api/returns/:id/refund',
    {
      preHandler: requirePermission('return.editRefund'),
      schema: { params: idParamSchema, body: updateReturnRefundInputSchema },
    },
    async (request) =>
      respondByRole(
        request,
        detailSchemas,
        updateReturnRefund(db(), request.user!, request.params.id, request.body),
      ),
  );
}
