import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { auditLogs, products, serialItems, stockMovements } from '../src/db/schema';
import * as stockService from '../src/services/stock.service';
import { createStaff, createTestApp, setUpShop, type TestClient } from './helpers';

let app: FastifyInstance;
let owner: TestClient;
let staff: TestClient;
beforeEach(async () => {
  app = await createTestApp();
  ({ owner } = await setUpShop(app));
  ({ staff } = await createStaff(owner));
});
afterEach(() => app.close());

async function newProduct(extra: Record<string, unknown> = {}) {
  const categories = (await owner.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  const res = await owner.post('/api/products', {
    sku: '',
    barcode: '',
    name: 'สินค้าทดสอบ',
    brand: '',
    categoryId: categories.find((c) => c.kind === 'other')!.id,
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
    ...extra,
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().id as number;
}

async function receive(client: TestClient, lines: Record<string, unknown>[]) {
  const res = await client.post('/api/goods-receipts', { lines });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { id: number; docNo: string };
}

const productRow = (id: number) =>
  app.database.db.select().from(products).where(eq(products.id, id)).get()!;

/** Takes stock out as a sale would (the POS arrives in Phase 2). */
function sellOut(productId: number, qty: number, serialIds?: number[]) {
  app.database.db.transaction((tx) =>
    stockService.move(tx, {
      productId,
      qtyChange: -qty,
      type: 'sale',
      userId: 1,
      serials: serialIds ? { ids: serialIds, status: 'sold' } : undefined,
    }),
  );
}

const verify = (id: number, lines: { itemId: number; unitCostSatang: number }[], as = owner) =>
  as.post(`/api/goods-receipts/${id}/verify-costs`, { lines });
const voidReceipt = (id: number, reason = 'รับผิดใบ', as = owner) =>
  as.post(`/api/goods-receipts/${id}/void`, { reason });
const itemsOf = async (id: number) =>
  (await owner.get(`/api/goods-receipts/${id}`)).json().lines as {
    id: number;
    productId: number;
    unitCostSatang: number;
    serials: { id: number; serialNo: string; status: string }[];
  }[];

describe('owner cost review', () => {
  it('corrects the average only for units still on hand, and audits the change', async () => {
    const ram = await newProduct();
    const receipt = await receive(staff, [{ productId: ram, qty: 2, unitCostSatang: 100_00 }]);
    sellOut(ram, 1); // one unit sold at the provisional cost

    const [line] = await itemsOf(receipt.id);
    expect(
      (await verify(receipt.id, [{ itemId: line!.id, unitCostSatang: 120_00 }], staff)).statusCode,
    ).toBe(403);

    const res = await verify(receipt.id, [{ itemId: line!.id, unitCostSatang: 120_00 }]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      costStatus: 'verified',
      costVerifiedByName: 'สมชาย ใจดี',
      totalCostSatang: 240_00,
      lines: [{ unitCostSatang: 120_00, lineTotalSatang: 240_00 }],
    });
    // The remaining unit costs 120 (not 140).
    expect(productRow(ram).costSatang).toBe(120_00);

    const audit = app.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'goods_receipt.cost_verify'))
      .get()!;
    expect(audit.detail).toMatchObject({
      changes: [{ cost: { from: 100_00, to: 120_00 }, average: { from: 100_00, to: 120_00 } }],
    });

    // Staff now see it as verified (and still no cost values).
    const seen = (await staff.get(`/api/goods-receipts/${receipt.id}`)).json();
    expect(seen.costStatus).toBe('verified');
    expect(seen).not.toHaveProperty('totalCostSatang');

    expect(
      (await verify(receipt.id, [{ itemId: line!.id, unitCostSatang: 1 }])).json().error.code,
    ).toBe('ALREADY_VERIFIED');
  });

  it('fills in a blank staff cost and gives serial units their final cost', async () => {
    const cpu = await newProduct({ serialRequired: true });
    const receipt = await receive(staff, [{ productId: cpu, qty: 2, serials: ['A', 'B'] }]);
    expect(productRow(cpu).costSatang).toBe(0); // no average yet → provisional 0

    const [line] = await itemsOf(receipt.id);
    await verify(receipt.id, [{ itemId: line!.id, unitCostSatang: 6_000_00 }]);
    expect(productRow(cpu).costSatang).toBe(6_000_00);
    const units = app.database.db.select().from(serialItems).all();
    expect(units.map((u) => u.unitCostSatang)).toEqual([6_000_00, 6_000_00]);
  });

  it('requires every line exactly once', async () => {
    const a = await newProduct();
    const b = await newProduct({ name: 'B' });
    const receipt = await receive(staff, [
      { productId: a, qty: 1, unitCostSatang: 100 },
      { productId: b, qty: 1, unitCostSatang: 100 },
    ]);
    const [first] = await itemsOf(receipt.id);
    const res = await verify(receipt.id, [{ itemId: first!.id, unitCostSatang: 100 }]);
    expect(res.json().error.code).toBe('LINES_MISMATCH');
    const other = await verify(receipt.id, [
      { itemId: first!.id, unitCostSatang: 100 },
      { itemId: 9999, unitCostSatang: 100 },
    ]);
    expect(other.json().error.code).toBe('LINES_MISMATCH');
  });
});

describe('voiding a goods receipt', () => {
  it('takes the stock back out, reverses the average, and keeps the ledger consistent', async () => {
    const ram = await newProduct();
    await receive(owner, [{ productId: ram, qty: 4, unitCostSatang: 100_00 }]);
    const second = await receive(owner, [{ productId: ram, qty: 4, unitCostSatang: 120_00 }]);
    expect(productRow(ram)).toMatchObject({ onHand: 8, costSatang: 110_00 });

    expect((await voidReceipt(second.id, 'x', staff)).statusCode).toBe(403);
    expect(
      (await owner.post(`/api/goods-receipts/${second.id}/void`, { reason: ' ' })).statusCode,
    ).toBe(400);

    const res = await voidReceipt(second.id, 'คีย์จำนวนผิด');
    expect(res.json()).toMatchObject({
      status: 'voided',
      voidReason: 'คีย์จำนวนผิด',
      voidedByName: 'สมชาย ใจดี',
    });
    expect(productRow(ram)).toMatchObject({ onHand: 4, costSatang: 100_00 });

    const voidMove = app.database.db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, ram), eq(stockMovements.type, 'void')))
      .get()!;
    expect(voidMove).toMatchObject({
      qtyChange: -4,
      balanceAfter: 4,
      reason: 'คีย์จำนวนผิด',
      refDocNo: second.docNo,
    });
    expect(stockService.findStockMismatches(app.database.db)).toEqual([]);

    expect((await voidReceipt(second.id)).json().error.code).toBe('RECEIPT_VOIDED');
    // A voided receipt can't be reviewed either.
    const [line] = await itemsOf(second.id);
    expect(
      (await verify(second.id, [{ itemId: line!.id, unitCostSatang: 1 }])).json().error.code,
    ).toBe('RECEIPT_VOIDED');
  });

  it('keeps the current average when nothing would be left', async () => {
    const ram = await newProduct();
    const receipt = await receive(owner, [{ productId: ram, qty: 2, unitCostSatang: 100_00 }]);
    await voidReceipt(receipt.id);
    expect(productRow(ram)).toMatchObject({ onHand: 0, costSatang: 100_00 });
  });

  it('refuses when stock from the receipt was already sold', async () => {
    const ram = await newProduct();
    const cpu = await newProduct({ serialRequired: true });
    const a = await receive(owner, [{ productId: ram, qty: 2, unitCostSatang: 100 }]);
    sellOut(ram, 1);
    expect((await voidReceipt(a.id)).json().error.code).toBe('RECEIPT_STOCK_USED');

    const b = await receive(owner, [{ productId: cpu, qty: 2, serials: ['S1', 'S2'] }]);
    const [line] = await itemsOf(b.id);
    sellOut(cpu, 1, [line!.serials[0]!.id]);
    expect((await voidReceipt(b.id)).json().error.code).toBe('RECEIPT_STOCK_USED');
    expect(productRow(cpu).onHand).toBe(1);
  });

  it('lets voided serial units be received again on a new receipt', async () => {
    const cpu = await newProduct({ serialRequired: true });
    const wrong = await receive(owner, [
      { productId: cpu, qty: 2, serials: ['S1', 'S2'], unitCostSatang: 100 },
    ]);
    await voidReceipt(wrong.id, 'ผิดราคา');
    expect(
      app.database.db
        .select()
        .from(serialItems)
        .all()
        .map((u) => u.status),
    ).toEqual(['returned_to_supplier', 'returned_to_supplier']);

    const right = await receive(owner, [
      { productId: cpu, qty: 3, serials: ['s1', 'S2', 'S3'], unitCostSatang: 200 },
    ]);
    const units = app.database.db.select().from(serialItems).all();
    expect(units).toHaveLength(3); // S1 and S2 reuse their rows
    expect(units.every((u) => u.status === 'in_stock' && u.unitCostSatang === 200)).toBe(true);
    expect(productRow(cpu).onHand).toBe(3);

    // Both receipts still list the units they moved.
    expect((await itemsOf(wrong.id))[0]!.serials.map((s) => s.serialNo)).toEqual(['S1', 'S2']);
    expect((await itemsOf(right.id))[0]!.serials.map((s) => s.serialNo)).toEqual([
      'S1',
      'S2',
      'S3',
    ]);
    expect(stockService.findStockMismatches(app.database.db)).toEqual([]);

    // A unit that's in stock can't be received twice.
    const again = await owner.post('/api/goods-receipts', {
      lines: [{ productId: cpu, qty: 1, serials: ['S3'] }],
    });
    expect(again.json().error.code).toBe('SERIAL_EXISTS');
  });
});
