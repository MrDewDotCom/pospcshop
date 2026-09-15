import type { FastifyInstance } from 'fastify';
import {
  customerHistoryOwnerSchema,
  customerHistoryStaffSchema,
  customerInputSchema,
  customerPhoneMatchQuerySchema,
  idParamSchema,
  listCustomersQuerySchema,
  updateCustomerInputSchema,
} from '@pcshop/shared';
import { respondByRole } from '../../lib/respondByRole';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import {
  createCustomer,
  findPhoneMatches,
  getCustomer,
  getCustomerHistory,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from './service';

const historySchemas = { owner: customerHistoryOwnerSchema, staff: customerHistoryStaffSchema };

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = () => app.database.db;
  const edit = { preHandler: requirePermission('customer.edit') };
  const archive = { preHandler: requirePermission('customer.archive') };

  r.get('/api/customers', { schema: { querystring: listCustomersQuerySchema } }, async (request) =>
    listCustomers(db(), request.query),
  );

  r.get(
    '/api/customers/phone-matches',
    { schema: { querystring: customerPhoneMatchQuerySchema } },
    async (request) => ({
      items: findPhoneMatches(db(), request.query.phone, request.query.excludeId),
    }),
  );

  r.get('/api/customers/:id', { schema: { params: idParamSchema } }, async (request) =>
    getCustomer(db(), request.params.id),
  );

  r.get('/api/customers/:id/history', { schema: { params: idParamSchema } }, async (request) =>
    respondByRole(request, historySchemas, getCustomerHistory(db(), request.params.id)),
  );

  r.post(
    '/api/customers',
    { ...edit, schema: { body: customerInputSchema } },
    async (request, reply) =>
      reply.code(201).send(createCustomer(db(), request.user!, request.body)),
  );

  r.patch(
    '/api/customers/:id',
    { ...edit, schema: { params: idParamSchema, body: updateCustomerInputSchema } },
    async (request) => updateCustomer(db(), request.user!, request.params.id, request.body),
  );

  r.post(
    '/api/customers/:id/archive',
    { ...archive, schema: { params: idParamSchema } },
    async (request) => setCustomerArchived(db(), request.user!, request.params.id, true),
  );

  r.post(
    '/api/customers/:id/unarchive',
    { ...archive, schema: { params: idParamSchema } },
    async (request) => setCustomerArchived(db(), request.user!, request.params.id, false),
  );
}
