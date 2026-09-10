import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { auditLogQuerySchema, type AuditLogItem, type Paginated } from '@pcshop/shared';
import { auditLogs, users } from '../../db/schema';
import { toIso } from '../../lib/time';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requirePermission('audit.view'));
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/audit-logs',
    { schema: { querystring: auditLogQuerySchema } },
    async (request): Promise<Paginated<AuditLogItem>> => {
      const { page, pageSize, userId, action } = request.query;
      const db = app.database.db;
      const filters: SQL[] = [];
      if (userId) filters.push(eq(auditLogs.userId, userId));
      if (action) filters.push(eq(auditLogs.action, action));
      const where = filters.length ? and(...filters) : undefined;

      const rows = db
        .select({ log: auditLogs, userName: users.name })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(where)
        .orderBy(desc(auditLogs.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all();
      const total = db.select({ n: count() }).from(auditLogs).where(where).get()!.n;

      return {
        total,
        items: rows.map(({ log, userName }) => ({
          id: log.id,
          createdAt: toIso(log.createdAt),
          action: log.action,
          userId: log.userId,
          userName,
          entityType: log.entityType,
          entityId: log.entityId,
          detail: log.detail,
        })),
      };
    },
  );
}
