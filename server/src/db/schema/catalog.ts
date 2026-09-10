import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { CATEGORY_KINDS, PRODUCT_CONDITIONS, WARRANTY_TYPES } from '@pcshop/shared';
import { users } from './auth';
import { createdAt, enumCheck, nonNegativeCheck, updatedAt } from './helpers';
import { files } from './system';

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /** Decides which spec form and compatibility rules apply. */
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Built-in categories can't be archived. */
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [enumCheck('categories', 'kind', CATEGORY_KINDS)],
);

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sku: text('sku').notNull().unique(),
    /** Optional; SQLite UNIQUE allows many NULLs. */
    barcode: text('barcode').unique(),
    name: text('name').notNull(),
    brand: text('brand').notNull().default(''),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    description: text('description').notNull().default(''),
    specs: text('specs', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    condition: text('condition', { enum: PRODUCT_CONDITIONS }).notNull().default('new'),
    warrantyType: text('warranty_type', { enum: WARRANTY_TYPES }).notNull().default('none'),
    /** Warranty given to the customer. */
    warrantyMonths: integer('warranty_months').notNull().default(0),
    /** Default supplier warranty used when receiving. */
    supplierWarrantyMonths: integer('supplier_warranty_months').notNull().default(0),
    /** Current selling price. NULL = "awaiting price": can't be sold. Owner-only. */
    priceSatang: integer('price_satang'),
    /** Price before a reduction; when > price the product shows a "-X%" badge. Owner-only. */
    regularPriceSatang: integer('regular_price_satang'),
    /** Moving weighted average cost. Never visible to staff. */
    costSatang: integer('cost_satang').notNull().default(0),
    /** False for services/labor (no stock). */
    trackStock: integer('track_stock', { mode: 'boolean' }).notNull().default(true),
    serialRequired: integer('serial_required', { mode: 'boolean' }).notNull().default(false),
    minStock: integer('min_stock').notNull().default(0),
    /** Cache of SUM(stock_movements.qty_change). Changed only by stock.service. */
    onHand: integer('on_hand').notNull().default(0),
    notes: text('notes').notNull().default(''),
    createdBy: integer('created_by').references(() => users.id),
    archivedAt: integer('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck('products', 'condition', PRODUCT_CONDITIONS),
    enumCheck('products', 'warranty_type', WARRANTY_TYPES),
    nonNegativeCheck('products', 'price_satang'),
    nonNegativeCheck('products', 'regular_price_satang'),
    nonNegativeCheck('products', 'cost_satang'),
    nonNegativeCheck('products', 'warranty_months'),
    nonNegativeCheck('products', 'supplier_warranty_months'),
    nonNegativeCheck('products', 'min_stock'),
    index('products_category_id_idx').on(t.categoryId),
    index('products_name_idx').on(t.name),
  ],
);

export const productImages = sqliteTable(
  'product_images',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    fileId: integer('file_id')
      .notNull()
      .references(() => files.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.fileId] })],
);

/** One row per pricing change; prices are public, so everyone may read this. */
export const productPriceHistory = sqliteTable(
  'product_price_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    priceSatang: integer('price_satang'),
    regularPriceSatang: integer('regular_price_satang'),
    changedBy: integer('changed_by').references(() => users.id),
    changedAt: integer('changed_at').notNull(),
  },
  (t) => [index('product_price_history_product_idx').on(t.productId, t.changedAt)],
);

/** Owner-defined custom tags. Automatic tags are derived (shared/tags.ts) and not stored. */
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  /** A key from the fixed UI palette, e.g. "blue". */
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  createdAt: createdAt(),
});

export const productTags = sqliteTable(
  'product_tags',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.tagId] }),
    index('product_tags_tag_idx').on(t.tagId),
  ],
);
