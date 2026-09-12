import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../src/db/client';
import {
  categories,
  payments,
  products,
  saleItems,
  sales,
  serialItems,
  users,
} from '../src/db/schema';
import { MIGRATIONS_FOLDER, createTestDatabase } from './helpers';

const EXPECTED_TABLES = [
  'audit_logs',
  'categories',
  'customers',
  'document_sequences',
  'files',
  'goods_receipt_items',
  'goods_receipts',
  'payments',
  'product_images',
  'product_price_history',
  'product_tags',
  'products',
  'sale_item_serials',
  'sale_items',
  'sale_return_items',
  'sale_returns',
  'sales',
  'serial_items',
  'sessions',
  'shop_settings',
  'stock_movement_serials',
  'stock_movements',
  'suppliers',
  'tags',
  'users',
];

function seedBasics(database: DatabaseManager) {
  const [category] = database.db
    .insert(categories)
    .values({ name: 'ซีพียู', kind: 'cpu' })
    .returning()
    .all();
  const [product] = database.db
    .insert(products)
    .values({ sku: 'CPU-001', name: 'Ryzen 5 7600', categoryId: category!.id })
    .returning()
    .all();
  return { category: category!, product: product! };
}

describe('database', () => {
  const opened: DatabaseManager[] = [];
  const open = (db: DatabaseManager) => (opened.push(db), db);
  afterEach(() => opened.splice(0).forEach((db) => db.close()));

  it('creates every table through migrations', () => {
    const database = open(createTestDatabase());
    const rows = database.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(EXPECTED_TABLES);
  });

  it('enforces foreign keys', () => {
    const database = open(createTestDatabase());
    expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() =>
      database.db.insert(products).values({ sku: 'X', name: 'X', categoryId: 999 }).run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('enforces enum and non-negative CHECK constraints', () => {
    const database = open(createTestDatabase());
    expect(() =>
      database.db
        .insert(users)
        // @ts-expect-error — deliberately invalid role to prove the DB rejects it
        .values({ name: 'A', username: 'a', passwordHash: 'x', role: 'admin' })
        .run(),
    ).toThrow(/CHECK/);

    const { category } = seedBasics(database);
    expect(() =>
      database.db
        .insert(products)
        .values({ sku: 'NEG', name: 'Neg', categoryId: category.id, priceSatang: -1 })
        .run(),
    ).toThrow(/CHECK/);
  });

  it('guards the sale tables: positive qty, non-negative money, returns within the sold qty', () => {
    const database = open(createTestDatabase());
    const { product } = seedBasics(database);
    const sale = database.db
      .insert(sales)
      .values({ docNo: 'RC6909-0001', soldAt: Date.now(), totalSatang: 100_00 })
      .returning()
      .all()[0]!;
    const line = {
      saleId: sale.id,
      productId: product.id,
      nameSnapshot: 'Ryzen 5 7600',
      qty: 2,
      unitPriceSatang: 50_00,
      lineTotalSatang: 100_00,
    };
    database.db.insert(saleItems).values(line).run();

    expect(() =>
      database.db
        .insert(saleItems)
        .values({ ...line, qty: 0 })
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      database.db
        .insert(saleItems)
        .values({ ...line, unitPriceSatang: -1 })
        .run(),
    ).toThrow(/CHECK/);
    // A line can never be returned more times than it was sold.
    expect(() =>
      database.db
        .insert(saleItems)
        .values({ ...line, returnedQty: 3 })
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      database.db
        .insert(payments)
        // @ts-expect-error — deliberately invalid payment method to prove the DB rejects it
        .values({
          saleId: sale.id,
          method: 'card',
          amountSatang: 100_00,
          receivedSatang: 100_00,
          paidAt: Date.now(),
        })
        .run(),
    ).toThrow(/CHECK/);
  });

  it('keeps serial numbers unique per product', () => {
    const database = open(createTestDatabase());
    const { product } = seedBasics(database);
    const serial = {
      productId: product.id,
      serialNo: 'SN-1',
      status: 'in_stock' as const,
      unitCostSatang: 100,
      receivedAt: Date.now(),
    };
    database.db.insert(serialItems).values(serial).run();
    expect(() => database.db.insert(serialItems).values(serial).run()).toThrow(/UNIQUE/);
  });

  it('uses WAL on disk and keeps data across reopen', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-db-'));
    try {
      const database = open(new DatabaseManager(path.join(dir, 'shop.db'), MIGRATIONS_FOLDER));
      expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
      seedBasics(database);

      database.reopen();
      expect(database.db.select().from(products).all()).toHaveLength(1);
      database.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
