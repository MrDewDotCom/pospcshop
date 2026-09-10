import type { FastifyInstance } from 'fastify';
import {
  createCategoryInputSchema,
  idParamSchema,
  listCategoriesQuerySchema,
  reorderCategoriesInputSchema,
  updateCategoryInputSchema,
  type Category,
} from '@pcshop/shared';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import {
  createCategory,
  listCategories,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from './service';

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manage = { preHandler: requirePermission('category.manage') };

  r.get(
    '/api/categories',
    { schema: { querystring: listCategoriesQuerySchema } },
    async (request): Promise<{ items: Category[] }> => ({
      items: listCategories(app.database.db, request.query.includeArchived),
    }),
  );

  r.post(
    '/api/categories',
    { ...manage, schema: { body: createCategoryInputSchema } },
    async (request, reply) =>
      reply.code(201).send(createCategory(app.database.db, request.user!, request.body)),
  );

  r.patch(
    '/api/categories/:id',
    { ...manage, schema: { params: idParamSchema, body: updateCategoryInputSchema } },
    async (request) =>
      updateCategory(app.database.db, request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/categories/:id/archive',
    { ...manage, schema: { params: idParamSchema } },
    async (request) => setCategoryArchived(app.database.db, request.user!, request.params.id, true),
  );

  r.post(
    '/api/categories/:id/unarchive',
    { ...manage, schema: { params: idParamSchema } },
    async (request) =>
      setCategoryArchived(app.database.db, request.user!, request.params.id, false),
  );

  r.put(
    '/api/categories/order',
    { ...manage, schema: { body: reorderCategoriesInputSchema } },
    async (request): Promise<{ items: Category[] }> => ({
      items: reorderCategories(app.database.db, request.body.ids),
    }),
  );
}
