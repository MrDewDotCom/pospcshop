import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt } from './helpers';

/**
 * Shop customers (PLAN.md §6.4). A customer is optional on a sale (Q14); this table exists so regulars,
 * warranty owners, and (Phase 5) repair jobs can be looked up. Never hard-deleted: `archived_at`.
 */
export const customers = sqliteTable(
  'customers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    /** Digits only (see shared `normalizePhone`), so 08-1234-5678 and 0812345678 match. */
    phoneNormalized: text('phone_normalized').notNull().default(''),
    lineId: text('line_id').notNull().default(''),
    address: text('address').notNull().default(''),
    notes: text('notes').notNull().default(''),
    archivedAt: integer('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('customers_name_idx').on(t.name),
    // Not unique: two people may share a phone (family, shop line). Used to warn about duplicates.
    index('customers_phone_idx').on(t.phoneNormalized),
  ],
);
