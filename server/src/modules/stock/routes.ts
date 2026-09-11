import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  idParamSchema,
  listStockMovementsQuerySchema,
  stockAdjustmentInputSchema,
  stockMovementOwnerSchema,
  stockMovementStaffSchema,
  type StockAdjustmentResult,
  type StockIntegrityReport,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import { adjustStock, checkStockIntegrity, listStockMovements } from './service';

// Movement rows carry the unit cost; staff get them without it.
const movementListSchemas = {
  owner: z.object({ items: z.array(stockMovementOwnerSchema), total: z.number() }),
  staff: z.object({ items: z.array(stockMovementStaffSchema), total: z.number() }),
};
const productMovementsQuerySchema = listStockMovementsQuerySchema.omit({ productId: true });

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;

  r.get(
    '/api/stock/movements',
    { schema: { querystring: listStockMovementsQuerySchema } },
    async (request) =>
      respondByRole(request, movementListSchemas, listStockMovements(db(), request.query)),
  );

  r.get(
    '/api/products/:id/movements',
    { schema: { params: idParamSchema, querystring: productMovementsQuerySchema } },
    async (request) =>
      respondByRole(
        request,
        movementListSchemas,
        listStockMovements(db(), { ...request.query, productId: request.params.id }),
      ),
  );

  r.post(
    '/api/stock/adjustments',
    {
      preHandler: requirePermission('stock.adjust'),
      schema: { body: stockAdjustmentInputSchema },
    },
    async (request, reply): Promise<StockAdjustmentResult> =>
      reply.code(201).send(adjustStock(db(), request.user!, request.body)),
  );

  r.get(
    '/api/stock/integrity',
    { preHandler: requirePermission('stock.checkIntegrity') },
    async (): Promise<StockIntegrityReport> => checkStockIntegrity(db()),
  );
}
