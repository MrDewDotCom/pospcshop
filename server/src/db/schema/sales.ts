import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import {
  PAYMENT_METHODS,
  REFUND_METHODS,
  RETURN_DISPOSITIONS,
  SALE_ITEM_KINDS,
  SALE_SOURCES,
  SALE_STATUSES,
} from '@pcshop/shared';
import { users } from './auth';
import { products } from './catalog';
import { customers } from './customers';
import { createdAt, enumCheck, nonNegativeCheck } from './helpers';
import { serialItems } from './inventory';

/**
 * Sales (PLAN.md §6.4). Every sale is fully paid at checkout (Q9) and is never deleted — a mistake is
 * voided (§7.6) or handled with a return (§7.8). Lines snapshot everything a receipt needs, so a receipt
 * printed a year later still shows what the customer actually bought at the price they actually paid.
 */
export const sales = sqliteTable(
  'sales',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    docNo: text('doc_no').notNull().unique(),
    /** Optional (Q14). The snapshots below are what the receipt shows. */
    customerId: integer('customer_id').references(() => customers.id),
    customerName: text('customer_name').notNull().default(''),
    customerPhone: text('customer_phone').notNull().default(''),
    soldAt: integer('sold_at').notNull(),
    status: text('status', { enum: SALE_STATUSES }).notNull().default('paid'),
    totalSatang: integer('total_satang').notNull(),
    /** Σ (regular − price) × qty: "ประหยัดไป ฿X" on the receipt (P19). */
    savingsSatang: integer('savings_satang').notNull().default(0),
    /** Cache of the refunds recorded against this sale by returns. */
    refundedSatang: integer('refunded_satang').notNull().default(0),
    /** Owner only. Σ line unit cost × qty at the moment of sale. */
    totalCostSatang: integer('total_cost_satang').notNull().default(0),
    source: text('source', { enum: SALE_SOURCES }).notNull().default('pos'),
    /** Filled in Phase 3 / Phase 5; the columns ship now so this table never has to be altered. */
    quoteId: integer('quote_id'),
    repairJobId: integer('repair_job_id'),
    note: text('note').notNull().default(''),
    salespersonId: integer('salesperson_id').references(() => users.id),
    createdAt: createdAt(),
    voidedAt: integer('voided_at'),
    voidedBy: integer('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
  },
  (t) => [
    enumCheck('sales', 'status', SALE_STATUSES),
    enumCheck('sales', 'source', SALE_SOURCES),
    nonNegativeCheck('sales', 'total_satang'),
    nonNegativeCheck('sales', 'savings_satang'),
    nonNegativeCheck('sales', 'refunded_satang'),
    nonNegativeCheck('sales', 'total_cost_satang'),
    index('sales_sold_at_idx').on(t.soldAt),
    index('sales_customer_idx').on(t.customerId),
    index('sales_salesperson_idx').on(t.salespersonId, t.soldAt),
  ],
);

export const saleItems = sqliteTable(
  'sale_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id),
    /** Build components are children of the build line (Phase 3, P23). */
    parentItemId: integer('parent_item_id').references((): AnySQLiteColumn => saleItems.id),
    kind: text('kind', { enum: SALE_ITEM_KINDS }).notNull().default('product'),
    productId: integer('product_id').references(() => products.id),
    /** Phase 3. */
    buildId: integer('build_id'),
    nameSnapshot: text('name_snapshot').notNull(),
    skuSnapshot: text('sku_snapshot').notNull().default(''),
    qty: integer('qty').notNull(),
    unitPriceSatang: integer('unit_price_satang').notNull(),
    lineTotalSatang: integer('line_total_satang').notNull(),
    /** Snapshot: the struck-through price and the "-X%" badge on the receipt (P19). */
    regularPriceSatang: integer('regular_price_satang'),
    /** Owner only. A serial line snapshots that unit's own cost (P22), others the moving average. */
    unitCostSatang: integer('unit_cost_satang').notNull().default(0),
    warrantyType: text('warranty_type').notNull().default('none'),
    warrantyMonths: integer('warranty_months').notNull().default(0),
    /** Cache of the quantity returned by sale_return_items. */
    returnedQty: integer('returned_qty').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    enumCheck('sale_items', 'kind', SALE_ITEM_KINDS),
    check('sale_items_qty_positive', sql.raw('"qty" > 0')),
    nonNegativeCheck('sale_items', 'unit_price_satang'),
    nonNegativeCheck('sale_items', 'line_total_satang'),
    nonNegativeCheck('sale_items', 'regular_price_satang'),
    nonNegativeCheck('sale_items', 'unit_cost_satang'),
    nonNegativeCheck('sale_items', 'returned_qty'),
    check('sale_items_returned_qty_max', sql.raw('"returned_qty" <= "qty"')),
    index('sale_items_sale_idx').on(t.saleId),
    index('sale_items_product_idx').on(t.productId),
  ],
);

/** Which physical units left the shop on a line. */
export const saleItemSerials = sqliteTable(
  'sale_item_serials',
  {
    saleItemId: integer('sale_item_id')
      .notNull()
      .references(() => saleItems.id),
    serialItemId: integer('serial_item_id')
      .notNull()
      .references(() => serialItems.id),
  },
  (t) => [
    primaryKey({ columns: [t.saleItemId, t.serialItemId] }),
    index('sale_item_serials_serial_idx').on(t.serialItemId),
  ],
);

/**
 * One payment per sale in this version (Q9). `received_satang` is what the user typed in — the explicit
 * confirmation that the money is really there — and for cash the change follows from it.
 */
export const payments = sqliteTable(
  'payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id),
    method: text('method', { enum: PAYMENT_METHODS }).notNull(),
    amountSatang: integer('amount_satang').notNull(),
    receivedSatang: integer('received_satang').notNull(),
    changeSatang: integer('change_satang').notNull().default(0),
    paidAt: integer('paid_at').notNull(),
    receivedBy: integer('received_by').references(() => users.id),
    voidedAt: integer('voided_at'),
  },
  (t) => [
    enumCheck('payments', 'method', PAYMENT_METHODS),
    nonNegativeCheck('payments', 'amount_satang'),
    nonNegativeCheck('payments', 'received_satang'),
    nonNegativeCheck('payments', 'change_satang'),
    index('payments_sale_idx').on(t.saleId),
  ],
);

/**
 * A return document against one sale (§7.8). Recording it does **not** change sellable stock: the units
 * go into quarantine and a separate explicit decision restocks, claims, or writes them off.
 */
export const saleReturns = sqliteTable(
  'sale_returns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    docNo: text('doc_no').notNull().unique(),
    saleId: integer('sale_id')
      .notNull()
      .references(() => sales.id),
    returnedAt: integer('returned_at').notNull(),
    reason: text('reason').notNull(),
    refundMethod: text('refund_method', { enum: REFUND_METHODS }).notNull().default('none'),
    /** Defaults to what the customer paid for the returned lines; only the owner may change it (P21). */
    refundSatang: integer('refund_satang').notNull().default(0),
    refundAdjustedBy: integer('refund_adjusted_by').references(() => users.id),
    refundAdjustedAt: integer('refund_adjusted_at'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck('sale_returns', 'refund_method', REFUND_METHODS),
    nonNegativeCheck('sale_returns', 'refund_satang'),
    index('sale_returns_sale_idx').on(t.saleId),
    index('sale_returns_returned_at_idx').on(t.returnedAt),
  ],
);

export const saleReturnItems = sqliteTable(
  'sale_return_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    returnId: integer('return_id')
      .notNull()
      .references(() => saleReturns.id),
    saleItemId: integer('sale_item_id')
      .notNull()
      .references(() => saleItems.id),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
    /** Required for serial products: exactly which unit came back. */
    serialItemId: integer('serial_item_id').references(() => serialItems.id),
    /** Refund share of this line, from the sale's snapshot. Owner-adjustable through the document. */
    refundSatang: integer('refund_satang').notNull().default(0),
    /** Owner only: the cost that leaves profit again when the line is returned. */
    unitCostSatang: integer('unit_cost_satang').notNull().default(0),
    disposition: text('disposition', { enum: RETURN_DISPOSITIONS }).notNull().default('pending'),
    resolvedAt: integer('resolved_at'),
    resolvedBy: integer('resolved_by').references(() => users.id),
    resolutionNote: text('resolution_note').notNull().default(''),
  },
  (t) => [
    enumCheck('sale_return_items', 'disposition', RETURN_DISPOSITIONS),
    check('sale_return_items_qty_positive', sql.raw('"qty" > 0')),
    nonNegativeCheck('sale_return_items', 'refund_satang'),
    nonNegativeCheck('sale_return_items', 'unit_cost_satang'),
    index('sale_return_items_return_idx').on(t.returnId),
    index('sale_return_items_sale_item_idx').on(t.saleItemId),
    index('sale_return_items_pending_idx').on(t.disposition),
  ],
);
