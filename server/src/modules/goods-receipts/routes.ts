import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createGoodsReceiptInputSchema,
  goodsReceiptListItemOwnerSchema,
  goodsReceiptListItemStaffSchema,
  goodsReceiptOwnerSchema,
  goodsReceiptStaffSchema,
  idParamSchema,
  listGoodsReceiptsQuerySchema,
  verifyGoodsReceiptCostsInputSchema,
  voidInputSchema,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import {
  createGoodsReceipt,
  getGoodsReceipt,
  listGoodsReceipts,
  verifyGoodsReceiptCosts,
  voidGoodsReceipt,
} from './service';

// Staff schemas have no cost fields: staff may type costs when receiving but never read them back.
const detailSchemas = { owner: goodsReceiptOwnerSchema, staff: goodsReceiptStaffSchema };
const listSchemas = {
  owner: z.object({ items: z.array(goodsReceiptListItemOwnerSchema), total: z.number() }),
  staff: z.object({ items: z.array(goodsReceiptListItemStaffSchema), total: z.number() }),
};

export async function goodsReceiptRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;

  r.get(
    '/api/goods-receipts',
    { schema: { querystring: listGoodsReceiptsQuerySchema } },
    async (request) => respondByRole(request, listSchemas, listGoodsReceipts(db(), request.query)),
  );

  r.get('/api/goods-receipts/:id', { schema: { params: idParamSchema } }, async (request) =>
    respondByRole(request, detailSchemas, getGoodsReceipt(db(), request.params.id)),
  );

  // Confirming a receipt puts the stock in immediately.
  r.post(
    '/api/goods-receipts',
    {
      preHandler: requirePermission('goodsReceipt.create'),
      schema: { body: createGoodsReceiptInputSchema },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          respondByRole(
            request,
            detailSchemas,
            createGoodsReceipt(db(), request.user!, request.body),
          ),
        ),
  );

  r.post(
    '/api/goods-receipts/:id/verify-costs',
    {
      preHandler: requirePermission('goodsReceipt.verifyCost'),
      schema: { params: idParamSchema, body: verifyGoodsReceiptCostsInputSchema },
    },
    async (request) =>
      verifyGoodsReceiptCosts(db(), request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/goods-receipts/:id/void',
    {
      preHandler: requirePermission('goodsReceipt.void'),
      schema: { params: idParamSchema, body: voidInputSchema },
    },
    async (request) => voidGoodsReceipt(db(), request.user!, request.params.id, request.body),
  );
}
