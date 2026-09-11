import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { findForbiddenKeys } from '@pcshop/shared';
import { auditLogs, products } from '../src/db/schema';
import { findStockMismatches } from '../src/services/stock.service';
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

const adjust = (body: Record<string, unknown>, as = owner) =>
  as.post('/api/stock/adjustments', body);
const productRow = (id: number) =>
  app.database.db.select().from(products).where(eq(products.id, id)).get()!;
const serialsOf = async (id: number, as = owner) =>
  (await as.get(`/api/products/${id}/serials`)).json().items as {
    id: number;
    serialNo: string;
    status: string;
    unitCostSatang?: number;
  }[];

describe('stock adjustments (owner)', () => {
  it('adds and removes quantity stock under one AJ number with the reason', async () => {
    const ram = await newProduct();
    const ssd = await newProduct({ name: 'SSD' });
    expect(
      (await adjust({ reason: 'x', lines: [{ productId: ram, qtyChange: 1 }] }, staff)).statusCode,
    ).toBe(403);

    const res = await adjust({
      reason: 'ยอดยกมาตอนเริ่มใช้ระบบ',
      lines: [
        { productId: ram, qtyChange: 5, unitCostSatang: 1_200_00 },
        { productId: ssd, qtyChange: 2 },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      docNo: expect.stringMatching(/^AJ\d{4}-0001$/),
      lines: [
        { productId: ram, qtyChange: 5, balanceAfter: 5 },
        { productId: ssd, qtyChange: 2, balanceAfter: 2 },
      ],
    });
    expect(productRow(ram)).toMatchObject({ onHand: 5, costSatang: 1_200_00 });
    expect(productRow(ssd)).toMatchObject({ onHand: 2, costSatang: 0 }); // blank cost: average unchanged

    const out = await adjust({ reason: 'นับสต็อกขาด', lines: [{ productId: ram, qtyChange: -2 }] });
    expect(out.json().lines[0].balanceAfter).toBe(3);
    expect(productRow(ram).costSatang).toBe(1_200_00);

    const tooMany = await adjust({ reason: 'x', lines: [{ productId: ram, qtyChange: -4 }] });
    expect(tooMany.json().error.code).toBe('INSUFFICIENT_STOCK');

    const audit = app.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'stock.adjust'))
      .all();
    expect(audit).toHaveLength(2);
    expect(findStockMismatches(app.database.db)).toEqual([]);
  });

  it('requires a reason and one line per product', async () => {
    const ram = await newProduct();
    expect(
      (await adjust({ reason: '  ', lines: [{ productId: ram, qtyChange: 1 }] })).statusCode,
    ).toBe(400);
    expect(
      (await adjust({ reason: 'x', lines: [{ productId: ram, qtyChange: 0 }] })).statusCode,
    ).toBe(400);
    const dup = await adjust({
      reason: 'x',
      lines: [
        { productId: ram, qtyChange: 1 },
        { productId: ram, qtyChange: 1 },
      ],
    });
    expect(dup.json().error.code).toBe('DUPLICATE_PRODUCT_LINE');
  });

  it('adds serial units by scanning and writes off chosen units; found units come back', async () => {
    const cpu = await newProduct({ serialRequired: true });
    await adjust({
      reason: 'ยอดยกมา',
      lines: [
        { productId: cpu, qtyChange: 3, serials: ['S1', 'S2', 'S3'], unitCostSatang: 500_00 },
      ],
    });
    const units = await serialsOf(cpu);
    expect(units.map((u) => [u.serialNo, u.status])).toEqual([
      ['S1', 'in_stock'],
      ['S2', 'in_stock'],
      ['S3', 'in_stock'],
    ]);

    const s2 = units[1]!.id;
    await adjust({
      reason: 'เครื่องเสียหาย',
      lines: [{ productId: cpu, qtyChange: -1, serialIds: [s2] }],
    });
    expect((await serialsOf(cpu)).find((u) => u.id === s2)!.status).toBe('written_off');
    expect(productRow(cpu).onHand).toBe(2);

    // Removing without choosing units, or adding with a known in-stock serial, is refused.
    expect(
      (await adjust({ reason: 'x', lines: [{ productId: cpu, qtyChange: -1 }] })).json().error.code,
    ).toBe('SERIAL_COUNT_MISMATCH');
    expect(
      (
        await adjust({ reason: 'x', lines: [{ productId: cpu, qtyChange: 1, serials: ['S1'] }] })
      ).json().error.code,
    ).toBe('SERIAL_EXISTS');

    // The written-off unit is found again: same row, back in stock.
    await adjust({
      reason: 'เจอเครื่องในโกดัง',
      lines: [{ productId: cpu, qtyChange: 1, serials: ['s2'] }],
    });
    expect((await serialsOf(cpu)).find((u) => u.id === s2)!.status).toBe('in_stock');
    expect(productRow(cpu).onHand).toBe(3);
    expect(findStockMismatches(app.database.db)).toEqual([]);
  });
});

describe('movement history', () => {
  it('lists movements newest first with filters, and hides unit cost from staff', async () => {
    const ram = await newProduct({ name: 'RAM' });
    const cpu = await newProduct({ name: 'CPU', serialRequired: true });
    await owner.post('/api/goods-receipts', {
      lines: [
        { productId: ram, qty: 4, unitCostSatang: 1_000_00 },
        { productId: cpu, qty: 1, serials: ['X1'], unitCostSatang: 5_000_00 },
      ],
    });
    const aj = (
      await adjust({ reason: 'นับขาด', lines: [{ productId: ram, qtyChange: -1 }] })
    ).json();

    const all = (await owner.get('/api/stock/movements')).json();
    expect(all.total).toBe(3);
    expect(all.items[0]).toMatchObject({
      type: 'adjustment',
      qtyChange: -1,
      balanceAfter: 3,
      refDocNo: aj.docNo,
      reason: 'นับขาด',
      performedByName: 'สมชาย ใจดี',
      productName: 'RAM',
      unitCostSatang: 1_000_00,
    });
    expect(all.items.find((m: { productId: number }) => m.productId === cpu).serialNos).toEqual([
      'X1',
    ]);

    const staffView = (await staff.get('/api/stock/movements')).json();
    expect(staffView.total).toBe(3);
    expect(findForbiddenKeys(staffView)).toEqual([]);

    const byType = (await staff.get('/api/stock/movements?type=receive')).json();
    expect(byType.total).toBe(2);
    const byProduct = (await staff.get(`/api/products/${ram}/movements`)).json();
    expect(byProduct.items.map((m: { qtyChange: number }) => m.qtyChange)).toEqual([-1, 4]);
    const byDoc = (await staff.get(`/api/stock/movements?q=${aj.docNo}`)).json();
    expect(byDoc.total).toBe(1);

    // Date range in Bangkok days: today has everything, a past day nothing.
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    expect((await staff.get(`/api/stock/movements?from=${today}&to=${today}`)).json().total).toBe(
      3,
    );
    expect((await staff.get('/api/stock/movements?to=2020-01-01')).json().total).toBe(0);
  });
});

describe('serial units', () => {
  it('lists a product’s units (cost only for the owner) and searches serials across products', async () => {
    const cpu = await newProduct({ name: 'CPU', serialRequired: true });
    await owner.post('/api/goods-receipts', {
      lines: [
        { productId: cpu, qty: 2, serials: ['ABC-001', 'ABC-002'], unitCostSatang: 5_000_00 },
      ],
    });
    const staffUnits = await serialsOf(cpu, staff);
    expect(staffUnits).toHaveLength(2);
    expect(findForbiddenKeys(staffUnits)).toEqual([]);
    expect((await serialsOf(cpu))[0]!.unitCostSatang).toBe(5_000_00);

    const found = (await staff.get('/api/serials?q=abc-002')).json();
    expect(found.items).toMatchObject([
      { serialNo: 'ABC-002', productName: 'CPU', status: 'in_stock' },
    ]);
    expect(findForbiddenKeys(found)).toEqual([]);
    expect((await staff.get('/api/products/9999/serials')).statusCode).toBe(404);
  });
});

describe('integrity check', () => {
  it('is owner-only and reports products whose cache disagrees with the ledger', async () => {
    const ram = await newProduct();
    await adjust({ reason: 'ยอดยกมา', lines: [{ productId: ram, qtyChange: 3 }] });
    expect((await staff.get('/api/stock/integrity')).statusCode).toBe(403);
    expect((await owner.get('/api/stock/integrity')).json()).toMatchObject({
      ok: true,
      mismatches: [],
    });

    app.database.db.update(products).set({ onHand: 10 }).where(eq(products.id, ram)).run();
    expect((await owner.get('/api/stock/integrity')).json()).toMatchObject({
      ok: false,
      mismatches: [{ productId: ram, onHand: 10, ledgerSum: 3 }],
    });
  });
});
