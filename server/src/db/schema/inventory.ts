import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  COST_SOURCES,
  COST_STATUSES,
  GOODS_RECEIPT_STATUSES,
  SERIAL_STATUSES,
  STOCK_MOVEMENT_TYPES,
} from '@pcshop/shared';
import { users } from './auth';
import { products } from './catalog';
import { createdAt, enumCheck, nonNegativeCheck, updatedAt } from './helpers';

export const suppliers = sqliteTable('suppliers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  contactName: text('contact_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  lineId: text('line_id').notNull().default(''),
  address: text('address').notNull().default(''),
  notes: text('notes').notNull().default(''),
  archivedAt: integer('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const goodsReceipts = sqliteTable(
  'goods_receipts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    docNo: text('doc_no').notNull().unique(),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    supplierInvoiceNo: text('supplier_invoice_no').notNull().default(''),
    receivedAt: integer('received_at').notNull(),
    notes: text('notes').notNull().default(''),
    status: text('status', { enum: GOODS_RECEIPT_STATUSES }).notNull().default('posted'),
    /** Staff-created receipts start unverified until the owner confirms or corrects the costs. */
    costStatus: text('cost_status', { enum: COST_STATUSES }).notNull(),
    costVerifiedBy: integer('cost_verified_by').references(() => users.id),
    costVerifiedAt: integer('cost_verified_at'),
    /** Owner-only. */
    totalCostSatang: integer('total_cost_satang').notNull().default(0),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    voidedAt: integer('voided_at'),
    voidedBy: integer('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
  },
  (t) => [
    enumCheck('goods_receipts', 'status', GOODS_RECEIPT_STATUSES),
    enumCheck('goods_receipts', 'cost_status', COST_STATUSES),
    nonNegativeCheck('goods_receipts', 'total_cost_satang'),
    index('goods_receipts_received_at_idx').on(t.receivedAt),
  ],
);

export const goodsReceiptItems = sqliteTable(
  'goods_receipt_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    goodsReceiptId: integer('goods_receipt_id')
      .notNull()
      .references(() => goodsReceipts.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
    /** Cost in effect for this line (provisional until the receipt is verified). Owner-only. */
    unitCostSatang: integer('unit_cost_satang').notNull(),
    /** "entered": typed on the receipt; "average": left blank, so the product's average was used. */
    costSource: text('cost_source', { enum: COST_SOURCES }).notNull(),
    lineTotalSatang: integer('line_total_satang').notNull(),
  },
  (t) => [
    check('goods_receipt_items_qty_positive', sql.raw('"qty" > 0')),
    enumCheck('goods_receipt_items', 'cost_source', COST_SOURCES),
    nonNegativeCheck('goods_receipt_items', 'unit_cost_satang'),
    index('goods_receipt_items_receipt_idx').on(t.goodsReceiptId),
    index('goods_receipt_items_product_idx').on(t.productId),
  ],
);

export const serialItems = sqliteTable(
  'serial_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    serialNo: text('serial_no').notNull(),
    status: text('status', { enum: SERIAL_STATUSES }).notNull(),
    /** Set when a customer-returned unit is restocked. */
    wasReturned: integer('was_returned', { mode: 'boolean' }).notNull().default(false),
    /** Actual cost of this unit. Owner-only. */
    unitCostSatang: integer('unit_cost_satang').notNull(),
    goodsReceiptItemId: integer('goods_receipt_item_id').references(() => goodsReceiptItems.id),
    receivedAt: integer('received_at').notNull(),
    supplierWarrantyExpiresAt: integer('supplier_warranty_expires_at'),
    notes: text('notes').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck('serial_items', 'status', SERIAL_STATUSES),
    nonNegativeCheck('serial_items', 'unit_cost_satang'),
    uniqueIndex('serial_items_product_serial_unique').on(t.productId, t.serialNo),
    index('serial_items_serial_no_idx').on(t.serialNo),
    index('serial_items_status_idx').on(t.productId, t.status),
  ],
);

/** Stock ledger: insert-only. Never update or delete rows. */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    qtyChange: integer('qty_change').notNull(),
    type: text('type', { enum: STOCK_MOVEMENT_TYPES }).notNull(),
    refType: text('ref_type'),
    refId: integer('ref_id'),
    refDocNo: text('ref_doc_no'),
    /** Owner-only. */
    unitCostSatang: integer('unit_cost_satang'),
    balanceAfter: integer('balance_after').notNull(),
    /** Required for adjustments and voids. */
    reason: text('reason'),
    performedBy: integer('performed_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck('stock_movements', 'type', STOCK_MOVEMENT_TYPES),
    check('stock_movements_qty_nonzero', sql.raw('"qty_change" <> 0')),
    index('stock_movements_product_idx').on(t.productId, t.createdAt),
    index('stock_movements_ref_idx').on(t.refType, t.refId),
  ],
);

export const stockMovementSerials = sqliteTable(
  'stock_movement_serials',
  {
    movementId: integer('movement_id')
      .notNull()
      .references(() => stockMovements.id),
    serialItemId: integer('serial_item_id')
      .notNull()
      .references(() => serialItems.id),
  },
  (t) => [
    primaryKey({ columns: [t.movementId, t.serialItemId] }),
    index('stock_movement_serials_serial_idx').on(t.serialItemId),
  ],
);
