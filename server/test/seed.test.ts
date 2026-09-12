// Sample data (PLAN.md Q10, sub-task 16): the wizard fills the shop with a demo catalogue, the ledger
// stays consistent, and "clear sample data" removes exactly the sample rows — only while untouched.

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { CATEGORY_KINDS, isDiscounted, type SampleDataStatus } from '@pcshop/shared';
import {
  categories,
  goodsReceiptItems,
  goodsReceipts,
  productPriceHistory,
  productTags,
  products,
  serialItems,
  stockMovementSerials,
  stockMovements,
  suppliers,
  tags,
} from '../src/db/schema';
import { findStockMismatches } from '../src/services/stock.service';
import { createStaff, createTestApp, SETUP_INPUT, TestClient } from './helpers';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A shop set up with (or without) the sample catalogue. */
async function shop(sampleData: boolean) {
  app = await createTestApp();
  const owner = new TestClient(app);
  const res = await owner.post('/api/setup', { ...SETUP_INPUT, sampleData });
  if (res.statusCode !== 200) throw new Error(`setup failed: ${res.body}`);
  return { app, db: app.database.db, owner };
}

describe('sample data seed', () => {
  it('is not created unless the wizard asks for it', async () => {
    const { db, owner } = await shop(false);
    expect(db.select().from(products).all()).toHaveLength(0);
    const status = (await owner.get('/api/seed/status')).json() as SampleDataStatus;
    expect(status).toMatchObject({ hasSampleData: false, canClear: false, products: 0 });
  });

  it('creates 40–60 products across every category, all flagged as sample data', async () => {
    const { db } = await shop(true);
    const all = db.select().from(products).all();
    expect(all.length).toBeGreaterThanOrEqual(40);
    expect(all.length).toBeLessThanOrEqual(60);
    expect(all.every((p) => p.isSample)).toBe(true);
    expect(
      db
        .select()
        .from(suppliers)
        .all()
        .every((s) => s.isSample),
    ).toBe(true);
    expect(
      db
        .select()
        .from(tags)
        .all()
        .every((t) => t.isSample),
    ).toBe(true);

    const kindOf = new Map(
      db
        .select()
        .from(categories)
        .all()
        .map((c) => [c.id, c.kind]),
    );
    const kinds = new Set(all.map((p) => kindOf.get(p.categoryId)));
    expect([...kinds].sort()).toEqual([...CATEGORY_KINDS].sort());
  });

  it('covers every product state the UI shows (discount, used, serial, out of stock, awaiting price)', async () => {
    const { db } = await shop(true);
    const all = db.select().from(products).all();
    const some = (predicate: (p: (typeof all)[number]) => boolean) => all.filter(predicate).length;

    expect(some((p) => isDiscounted(p))).toBeGreaterThanOrEqual(5);
    expect(some((p) => p.condition === 'used')).toBeGreaterThanOrEqual(3);
    expect(some((p) => p.serialRequired && p.onHand > 0)).toBeGreaterThanOrEqual(5);
    expect(some((p) => p.trackStock && p.onHand === 0)).toBeGreaterThanOrEqual(1);
    expect(
      some((p) => p.trackStock && p.onHand > 0 && p.onHand <= p.minStock),
    ).toBeGreaterThanOrEqual(1);
    expect(some((p) => !p.trackStock)).toBeGreaterThanOrEqual(1);
    expect(some((p) => p.priceSatang === null)).toBe(1);
    expect(some((p) => p.barcode !== null)).toBeGreaterThanOrEqual(5);
    expect(db.select().from(productTags).all().length).toBeGreaterThanOrEqual(10);
    expect(db.select().from(productPriceHistory).all().length).toBeGreaterThanOrEqual(40);

    // Every priced product sells above its cost, and a regular price is always the higher one.
    for (const p of all) {
      if (p.priceSatang !== null && p.trackStock)
        expect(p.priceSatang).toBeGreaterThan(p.costSatang);
      if (p.regularPriceSatang !== null) {
        expect(p.regularPriceSatang).toBeGreaterThan(p.priceSatang!);
      }
    }
  });

  it('brings stock in through the ledger, with matching receipts and serial units', async () => {
    const { db } = await shop(true);
    expect(findStockMismatches(db)).toEqual([]);

    const receipts = db.select().from(goodsReceipts).all();
    expect(receipts.length).toBeGreaterThanOrEqual(3);
    expect(receipts.every((r) => r.isSample && r.costStatus === 'verified')).toBe(true);
    for (const receipt of receipts) {
      const lines = db
        .select()
        .from(goodsReceiptItems)
        .where(eq(goodsReceiptItems.goodsReceiptId, receipt.id))
        .all();
      expect(lines.length).toBeGreaterThan(0);
      const total = lines.reduce((sum, line) => sum + line.lineTotalSatang, 0);
      expect(receipt.totalCostSatang).toBe(total);
      for (const line of lines) {
        expect(line.lineTotalSatang).toBe(line.unitCostSatang * line.qty);
        // One receipt per product, so the moving average equals that receipt's unit cost.
        const product = db.select().from(products).where(eq(products.id, line.productId)).get()!;
        expect(product.costSatang).toBe(line.unitCostSatang);
        expect(product.onHand).toBe(line.qty);
      }
    }

    const units = db.select().from(serialItems).all();
    expect(units.length).toBeGreaterThanOrEqual(20);
    expect(units.every((u) => u.status === 'in_stock' && u.unitCostSatang > 0)).toBe(true);
    expect(new Set(units.map((u) => `${u.productId}/${u.serialNo}`)).size).toBe(units.length);
  });

  it('shows up in the product list and lookup as normal data', async () => {
    const { owner } = await shop(true);
    const list = (await owner.get('/api/products?pageSize=100')).json() as {
      total: number;
      items: { sku: string; onHand: number }[];
    };
    expect(list.total).toBeGreaterThanOrEqual(40);

    const lookup = await owner.get('/api/products/lookup?code=CPU-0001-S01');
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().matchedBy).toBe('serial');
  });
});

describe('clear sample data', () => {
  it('is owner only', async () => {
    const { owner } = await shop(true);
    const { staff } = await createStaff(owner);
    expect((await staff.get('/api/seed/status')).statusCode).toBe(403);
    expect((await staff.post('/api/seed/clear')).statusCode).toBe(403);
  });

  it('removes every sample row and leaves a clean, consistent database', async () => {
    const { db, owner } = await shop(true);
    const res = await owner.post('/api/seed/clear');
    expect(res.statusCode).toBe(200);
    expect(res.json().cleared).toMatchObject({ suppliers: 4, tags: 4 });
    expect(res.json().status).toMatchObject({ hasSampleData: false, canClear: false });

    const emptied = {
      products,
      suppliers,
      tags,
      productTags,
      productPriceHistory,
      goodsReceipts,
      goodsReceiptItems,
      serialItems,
      stockMovements,
      stockMovementSerials,
    };
    for (const [name, table] of Object.entries(emptied)) {
      expect(db.select().from(table).all(), `${name} should be empty`).toEqual([]);
    }
    expect(findStockMismatches(db)).toEqual([]);
    // The categories created by the setup are not sample data and stay.
    expect(db.select().from(categories).all().length).toBe(CATEGORY_KINDS.length);

    const again = await owner.post('/api/seed/clear');
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('NO_SAMPLE_DATA');
  });

  it('refuses once the sample stock has been used, and says why', async () => {
    const { db, owner } = await shop(true);
    const product = db.select().from(products).where(eq(products.sku, 'RAM-0002')).get()!;
    const adjust = await owner.post('/api/stock/adjustments', {
      reason: 'นับสต็อกประจำเดือน',
      lines: [{ productId: product.id, qtyChange: -1 }],
    });
    expect(adjust.statusCode).toBe(201);

    const status = (await owner.get('/api/seed/status')).json() as SampleDataStatus;
    expect(status.canClear).toBe(false);
    expect(status.blockedReason).toContain('ปรับสต็อก');

    const res = await owner.post('/api/seed/clear');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SAMPLE_DATA_IN_USE');
    expect(db.select().from(products).all().length).toBeGreaterThan(0);
  });

  it('keeps a sample tag or supplier that the shop used for its own data', async () => {
    const { db, owner } = await shop(true);
    const tag = db.select().from(tags).where(eq(tags.name, 'ขายดี')).get()!;
    const supplier = db.select().from(suppliers).all()[0]!;
    const categoryId = db.select().from(categories).all()[0]!.id;

    const own = await owner.post('/api/products', {
      sku: '',
      barcode: '',
      name: 'สินค้าจริงของร้าน',
      brand: '',
      categoryId,
      condition: 'new',
      warrantyType: 'none',
      warrantyMonths: 0,
      supplierWarrantyMonths: 0,
      trackStock: true,
      serialRequired: false,
      minStock: 0,
      notes: '',
      description: '',
      specs: {},
      pricing: { priceSatang: 100_00 },
    });
    expect(own.statusCode).toBe(201);
    await owner.request('PUT', `/api/products/${own.json().id}/tags`, { tagIds: [tag.id] });
    const receipt = await owner.post('/api/goods-receipts', {
      supplierId: supplier.id,
      lines: [{ productId: own.json().id, qty: 1, unitCostSatang: 80_00 }],
    });
    expect(receipt.statusCode).toBe(201);

    const res = await owner.post('/api/seed/clear');
    expect(res.statusCode).toBe(200);
    expect(res.json().kept).toEqual({ tags: 1, suppliers: 1 });

    const keptTag = db.select().from(tags).where(eq(tags.id, tag.id)).get()!;
    expect(keptTag.isSample).toBe(false);
    const keptSupplier = db.select().from(suppliers).where(eq(suppliers.id, supplier.id)).get()!;
    expect(keptSupplier.isSample).toBe(false);
    // The shop's own product, its receipt and its stock are untouched.
    expect(db.select().from(products).all()).toHaveLength(1);
    expect(db.select().from(goodsReceipts).all()).toHaveLength(1);
    expect(findStockMismatches(db)).toEqual([]);
  });
});
