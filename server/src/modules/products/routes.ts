import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createProductInputSchema,
  idParamSchema,
  listProductsQuerySchema,
  lookupQuerySchema,
  productListItemOwnerSchema,
  productListItemStaffSchema,
  productOwnerSchema,
  productPricingInputSchema,
  productStaffSchema,
  setProductImagesInputSchema,
  updateProductInputSchema,
  type PriceHistoryEntry,
} from '@pcshop/shared';
import { notFound } from '../../lib/errors';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import {
  createProduct,
  endProductDiscount,
  getProduct,
  listPriceHistory,
  listProducts,
  lookupProduct,
  setProductArchived,
  setProductImages,
  setProductPricing,
  updateProduct,
} from './service';

// Response shapes per role: staff schemas simply have no cost fields.
const detailSchemas = { owner: productOwnerSchema, staff: productStaffSchema };
const listSchemas = {
  owner: z.object({ items: z.array(productListItemOwnerSchema), total: z.number() }),
  staff: z.object({ items: z.array(productListItemStaffSchema), total: z.number() }),
};
const lookupShape = <T extends z.ZodType>(product: T) =>
  z.object({
    product,
    matchedBy: z.enum(['barcode', 'sku', 'serial']),
    code: z.string(),
    serialItemId: z.number().optional(),
  });
const lookupSchemas = {
  owner: lookupShape(productListItemOwnerSchema),
  staff: lookupShape(productListItemStaffSchema),
};

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;

  r.get('/api/products', { schema: { querystring: listProductsQuerySchema } }, async (request) =>
    respondByRole(request, listSchemas, listProducts(db(), request.query)),
  );

  // Exact match for barcode scanners (barcode → SKU → serial, with Thai-layout correction).
  r.get('/api/products/lookup', { schema: { querystring: lookupQuerySchema } }, async (request) => {
    const found = lookupProduct(db(), request.query.code);
    if (!found) throw notFound(`ไม่พบสินค้ารหัส "${request.query.code}"`, 'PRODUCT_NOT_FOUND');
    return respondByRole(request, lookupSchemas, found);
  });

  r.get('/api/products/:id', { schema: { params: idParamSchema } }, async (request) =>
    respondByRole(request, detailSchemas, getProduct(db(), request.params.id)),
  );

  r.get(
    '/api/products/:id/price-history',
    { schema: { params: idParamSchema } },
    async (request): Promise<{ items: PriceHistoryEntry[] }> => ({
      items: listPriceHistory(db(), request.params.id),
    }),
  );

  r.post(
    '/api/products',
    { preHandler: requirePermission('product.create'), schema: { body: createProductInputSchema } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          respondByRole(request, detailSchemas, createProduct(db(), request.user!, request.body)),
        ),
  );

  // Owner: any non-money field. Staff: description and specs only (checked in the service).
  r.patch(
    '/api/products/:id',
    {
      preHandler: requirePermission('product.editDetails'),
      schema: { params: idParamSchema, body: updateProductInputSchema },
    },
    async (request) =>
      respondByRole(
        request,
        detailSchemas,
        updateProduct(db(), request.user!, request.params.id, request.body),
      ),
  );

  r.put(
    '/api/products/:id/images',
    {
      preHandler: requirePermission('product.editDetails'),
      schema: { params: idParamSchema, body: setProductImagesInputSchema },
    },
    async (request) =>
      respondByRole(
        request,
        detailSchemas,
        setProductImages(db(), request.params.id, request.body.fileIds),
      ),
  );

  // Money fields change only here (owner only).
  r.put(
    '/api/products/:id/pricing',
    {
      preHandler: requirePermission('product.editPricing'),
      schema: { params: idParamSchema, body: productPricingInputSchema },
    },
    async (request) => setProductPricing(db(), request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/products/:id/pricing/end-discount',
    { preHandler: requirePermission('product.editPricing'), schema: { params: idParamSchema } },
    async (request) => endProductDiscount(db(), request.user!, request.params.id),
  );

  r.post(
    '/api/products/:id/archive',
    { preHandler: requirePermission('product.archive'), schema: { params: idParamSchema } },
    async (request) => setProductArchived(db(), request.user!, request.params.id, true),
  );

  r.post(
    '/api/products/:id/unarchive',
    { preHandler: requirePermission('product.archive'), schema: { params: idParamSchema } },
    async (request) => setProductArchived(db(), request.user!, request.params.id, false),
  );
}
