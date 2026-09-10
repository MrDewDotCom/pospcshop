import type { AppDatabase } from '../db/client';
import { auditLogs } from '../db/schema';

/** A database or an open transaction (Drizzle's transaction object has the same query API). */
type DbOrTx = Pick<AppDatabase, 'insert'>;

export interface AuditEntry {
  /** null for actions performed by the system or the CLI. */
  userId: number | null;
  /** e.g. "auth.login", "sale.void", "product.pricing_change" */
  action: string;
  entityType?: string;
  entityId?: number;
  detail?: Record<string, unknown>;
}

/** Records who did what. Call it inside the same transaction as the change it describes. */
export function writeAudit(db: DbOrTx, entry: AuditEntry): void {
  db.insert(auditLogs)
    .values({
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? null,
    })
    .run();
}
