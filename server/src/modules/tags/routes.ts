import type { FastifyInstance } from 'fastify';
import {
  createTagInputSchema,
  idParamSchema,
  listTagsQuerySchema,
  reorderTagsInputSchema,
  updateTagInputSchema,
  type Tag,
} from '@pcshop/shared';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import { createTag, listTags, reorderTags, setTagArchived, updateTag } from './service';

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manage = { preHandler: requirePermission('tag.manage') };

  // Everyone may read tags (staff filter the product list by them).
  r.get(
    '/api/tags',
    { schema: { querystring: listTagsQuerySchema } },
    async (request): Promise<{ items: Tag[] }> => ({
      items: listTags(app.database.db, request.query.includeArchived),
    }),
  );

  r.post(
    '/api/tags',
    { ...manage, schema: { body: createTagInputSchema } },
    async (request, reply) =>
      reply.code(201).send(createTag(app.database.db, request.user!, request.body)),
  );

  r.patch(
    '/api/tags/:id',
    { ...manage, schema: { params: idParamSchema, body: updateTagInputSchema } },
    async (request) => updateTag(app.database.db, request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/tags/:id/archive',
    { ...manage, schema: { params: idParamSchema } },
    async (request) => setTagArchived(app.database.db, request.user!, request.params.id, true),
  );

  r.post(
    '/api/tags/:id/unarchive',
    { ...manage, schema: { params: idParamSchema } },
    async (request) => setTagArchived(app.database.db, request.user!, request.params.id, false),
  );

  r.put(
    '/api/tags/order',
    { ...manage, schema: { body: reorderTagsInputSchema } },
    async (request): Promise<{ items: Tag[] }> => ({
      items: reorderTags(app.database.db, request.body.ids),
    }),
  );
}
