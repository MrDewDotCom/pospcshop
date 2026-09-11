import type { FastifyInstance } from 'fastify';
import {
  idParamSchema,
  listSuppliersQuerySchema,
  supplierInputSchema,
  updateSupplierInputSchema,
} from '@pcshop/shared';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  setSupplierArchived,
  updateSupplier,
} from './service';

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;
  const edit = { preHandler: requirePermission('supplier.edit') };
  const archive = { preHandler: requirePermission('supplier.archive') };

  r.get('/api/suppliers', { schema: { querystring: listSuppliersQuerySchema } }, async (request) =>
    listSuppliers(db(), request.query),
  );

  r.get('/api/suppliers/:id', { schema: { params: idParamSchema } }, async (request) =>
    getSupplier(db(), request.params.id),
  );

  r.post(
    '/api/suppliers',
    { ...edit, schema: { body: supplierInputSchema } },
    async (request, reply) =>
      reply.code(201).send(createSupplier(db(), request.user!, request.body)),
  );

  r.patch(
    '/api/suppliers/:id',
    { ...edit, schema: { params: idParamSchema, body: updateSupplierInputSchema } },
    async (request) => updateSupplier(db(), request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/suppliers/:id/archive',
    { ...archive, schema: { params: idParamSchema } },
    async (request) => setSupplierArchived(db(), request.user!, request.params.id, true),
  );

  r.post(
    '/api/suppliers/:id/unarchive',
    { ...archive, schema: { params: idParamSchema } },
    async (request) => setSupplierArchived(db(), request.user!, request.params.id, false),
  );
}
