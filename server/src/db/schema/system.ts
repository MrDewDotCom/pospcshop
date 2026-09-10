import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { DOC_TYPES, SEQUENCE_RESET_POLICIES } from '@pcshop/shared';
import { users } from './auth';
import { createdAt, enumCheck, nonNegativeCheck, updatedAt } from './helpers';

export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Content hash: identical uploads are stored once. */
  sha256: text('sha256').notNull().unique(),
  /** Relative to the uploads directory, e.g. "ab/abcdef….jpg". */
  path: text('path').notNull(),
  thumbPath: text('thumb_path'),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: createdAt(),
});

/** Single row (id = 1), created by the first-run setup. */
export const shopSettings = sqliteTable(
  'shop_settings',
  {
    id: integer('id').primaryKey(),
    shopName: text('shop_name').notNull(),
    logoFileId: integer('logo_file_id').references(() => files.id),
    address: text('address').notNull().default(''),
    phone: text('phone').notNull().default(''),
    lineId: text('line_id').notNull().default(''),
    promptpayId: text('promptpay_id').notNull().default(''),
    receiptFooter: text('receipt_footer').notNull().default(''),
    useBuddhistEra: integer('use_buddhist_era', { mode: 'boolean' }).notNull().default(true),
    allowNegativeStock: integer('allow_negative_stock', { mode: 'boolean' })
      .notNull()
      .default(false),
    defaultAssemblyFeeSatang: integer('default_assembly_fee_satang').notNull().default(0),
    /** NULL = the default <data dir>/backups. */
    backupDir: text('backup_dir'),
    backupKeepCount: integer('backup_keep_count').notNull().default(14),
    backupHour: integer('backup_hour').notNull().default(22),
    /** scrypt hash of the one-time owner recovery code shown at setup. */
    recoveryCodeHash: text('recovery_code_hash'),
    updatedAt: updatedAt(),
  },
  () => [
    check('shop_settings_single_row', sql.raw('"id" = 1')),
    nonNegativeCheck('shop_settings', 'default_assembly_fee_satang'),
    check(
      'shop_settings_backup_keep_count_range',
      sql.raw('"backup_keep_count" BETWEEN 1 AND 365'),
    ),
    check('shop_settings_backup_hour_range', sql.raw('"backup_hour" BETWEEN 0 AND 23')),
  ],
);

export const documentSequences = sqliteTable(
  'document_sequences',
  {
    docType: text('doc_type', { enum: DOC_TYPES }).primaryKey(),
    /** e.g. "RC{YY}{MM}-{SEQ:4}" */
    format: text('format').notNull(),
    resetPolicy: text('reset_policy', { enum: SEQUENCE_RESET_POLICIES }).notNull(),
    /** Period of `last_number`, e.g. "2026-09" (monthly), "2026" (yearly), "" (never). */
    currentPeriod: text('current_period').notNull().default(''),
    lastNumber: integer('last_number').notNull().default(0),
  },
  () => [
    enumCheck('document_sequences', 'doc_type', DOC_TYPES),
    enumCheck('document_sequences', 'reset_policy', SEQUENCE_RESET_POLICIES),
    nonNegativeCheck('document_sequences', 'last_number'),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** NULL for actions performed by the system (e.g. scheduled backups). */
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: integer('entity_id'),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_created_at_idx').on(t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);
