import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { findForbiddenKeys, toBangkokParts } from '@pcshop/shared';
import { products, serialItems, stockMovements } from '../src/db/schema';
import { findStockMismatches } from '../src/services/stock.service';
import { createStaff, createTestApp, setUpShop, type TestClient } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

async function newProduct(client: TestClient, extra: Record<string, unknown> = {}) {
  const categories = (await client.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  const res = await client.post('/api/products', {
    sku: '',
    barcode: '',
    name: 'Kingston Fury 16GB',
    brand: '',
    categoryId: categories.find((c) => c.kind === 'other')!.id,
    condition: 'new',
    warrantyType: 'distributor',
    warrantyMonths: 36,
    supplierWarrantyMonths: 36,
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

const productRow = (id: number) =>
  app.database.db.select().from(products).where(eq(products.id, id)).get()!;

describe('receiving goods', () => {
  it('owner receipt: verified, stock in, average cost updated, serials created', async () => {
    const { owner } = await setUpShop(app);
    const supplier = (await owner.post('/api/suppliers', { name: 'ซินเน็ค' })).json();
    const ram = await newProduct(owner);
    const cpu = await newProduct(owner, { name: 'Ryzen 5 7600', serialRequired: true });

    const res = await owner.post('/api/goods-receipts', {
      supplierId: supplier.id,
      supplierInvoiceNo: 'INV-001',
      lines: [
        { productId: ram, qty: 4, unitCostSatang: 100_000 },
        { productId: cpu, qty: 2, unitCostSatang: 600_000, serials: ['CPU-A', 'CPU-B'] },
      ],
    });
    expect(res.statusCode).toBe(201);
    const receipt = res.json();
    expect(receipt).toMatchObject({
      docNo: expect.stringMatching(/^GR\d{4}-0001$/),
      supplierName: 'ซินเน็ค',
      status: 'posted',
      costStatus: 'verified',
      lineCount: 2,
      totalQty: 6,
      totalCostSatang: 1_600_000,
    });
    expect(receipt.lines[1].serials.map((s: { serialNo: string }) => s.serialNo)).toEqual([
      'CPU-A',
      'CPU-B',
    ]);

    expect(productRow(ram)).toMatchObject({ onHand: 4, costSatang: 100_000 });
    expect(productRow(cpu)).toMatchObject({ onHand: 2, costSatang: 600_000 });

    // Second receipt at a different cost moves the average: (4×1000 + 4×1200) / 8 = 1100
    await owner.post('/api/goods-receipts', {
      lines: [{ productId: ram, qty: 4, unitCostSatang: 120_000 }],
    });
    expect(productRow(ram)).toMatchObject({ onHand: 8, costSatang: 110_000 });

    // Serials carry the supplier warranty expiry (36 months from receiving).
    const unit = app.database.db.select().from(serialItems).get()!;
    expect(toBangkokParts(unit.supplierWarrantyExpiresAt!).year).toBe(
      toBangkokParts(unit.receivedAt).year + 3,
    );
    const movement = app.database.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, cpu))
      .get()!;
    expect(movement).toMatchObject({
      type: 'receive',
      qtyChange: 2,
      refType: 'goods_receipt',
      refDocNo: receipt.docNo,
      unitCostSatang: 600_000,
    });
    expect(findStockMismatches(app.database.db)).toEqual([]);
  });

  it('staff may type costs but never read them back; their receipts are unverified', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const ram = await newProduct(owner);
    await owner.post('/api/goods-receipts', {
      lines: [{ productId: ram, qty: 2, unitCostSatang: 100_000 }],
    });

    const res = await staff.post('/api/goods-receipts', {
      lines: [
        { productId: ram, qty: 2, unitCostSatang: 140_000 },
        { productId: ram, qty: 1 }, // blank cost → the current average
      ],
    });
    expect(res.statusCode).toBe(201);
    const receipt = res.json();
    expect(receipt.costStatus).toBe('unverified');
    expect(findForbiddenKeys(receipt)).toEqual([]);
    expect(receipt.lines[0]).not.toHaveProperty('costSource');

    const seenByStaff = (await staff.get(`/api/goods-receipts/${receipt.id}`)).json();
    expect(findForbiddenKeys(seenByStaff)).toEqual([]);
    expect(findForbiddenKeys((await staff.get('/api/goods-receipts')).json())).toEqual([]);

    // Stock goes in immediately; the average moves provisionally: (2×1000 + 2×1400) / 4 = 1200,
    // then the blank line adds 1 unit at 1200 → 1200.
    expect(productRow(ram)).toMatchObject({ onHand: 5, costSatang: 120_000 });

    const seenByOwner = (await owner.get(`/api/goods-receipts/${receipt.id}`)).json();
    expect(seenByOwner.lines).toMatchObject([
      { unitCostSatang: 140_000, costSource: 'entered', lineTotalSatang: 280_000 },
      { unitCostSatang: 120_000, costSource: 'average', lineTotalSatang: 120_000 },
    ]);
    expect(seenByOwner.totalCostSatang).toBe(400_000);

    const unverified = (await owner.get('/api/goods-receipts?costStatus=unverified')).json();
    expect(unverified.items.map((r: { id: number }) => r.id)).toEqual([receipt.id]);
  });

  it('rolls everything back when a line is invalid (no stock, no receipt, no number used)', async () => {
    const { owner } = await setUpShop(app);
    const ram = await newProduct(owner);
    const cpu = await newProduct(owner, { serialRequired: true });

    const res = await owner.post('/api/goods-receipts', {
      lines: [
        { productId: ram, qty: 3, unitCostSatang: 100 },
        { productId: cpu, qty: 2, unitCostSatang: 100, serials: ['ONLY-ONE'] },
      ],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('SERIAL_COUNT_MISMATCH');
    expect(productRow(ram)).toMatchObject({ onHand: 0, costSatang: 0 });
    expect((await owner.get('/api/goods-receipts')).json().total).toBe(0);

    const ok = await owner.post('/api/goods-receipts', {
      lines: [{ productId: ram, qty: 1, unitCostSatang: 100 }],
    });
    expect(ok.json().docNo).toMatch(/-0001$/);
  });

  it('rejects serials already in the system, fixing Thai-layout scans first', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await newProduct(owner, { serialRequired: true });
    // "SN123" scanned with the Thai keyboard layout active (shift+S = ฆ, shift+N = ์).
    const first = await owner.post('/api/goods-receipts', {
      lines: [{ productId: cpu, qty: 1, serials: ['ฆ์ๅ/-'] }],
    });
    expect(first.json().lines[0].serials[0].serialNo).toBe('SN123');

    const again = await owner.post('/api/goods-receipts', {
      lines: [{ productId: cpu, qty: 1, serials: ['sn123'] }],
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SERIAL_EXISTS');
  });

  it('refuses archived products and suppliers, untracked products, and stray serials', async () => {
    const { owner } = await setUpShop(app);
    const ram = await newProduct(owner);
    const service = await newProduct(owner, { trackStock: false });
    const archived = await newProduct(owner);
    await owner.post(`/api/products/${archived}/archive`);
    const supplier = (await owner.post('/api/suppliers', { name: 'เลิกค้าขาย' })).json();
    await owner.post(`/api/suppliers/${supplier.id}/archive`);

    const code = async (body: Record<string, unknown>) =>
      (await owner.post('/api/goods-receipts', body)).json().error.code;
    expect(await code({ lines: [{ productId: service, qty: 1 }] })).toBe('STOCK_NOT_TRACKED');
    expect(await code({ lines: [{ productId: archived, qty: 1 }] })).toBe('PRODUCT_ARCHIVED');
    expect(await code({ lines: [{ productId: 9999, qty: 1 }] })).toBe('PRODUCT_NOT_FOUND');
    expect(await code({ supplierId: supplier.id, lines: [{ productId: ram, qty: 1 }] })).toBe(
      'SUPPLIER_ARCHIVED',
    );
    expect(await code({ lines: [{ productId: ram, qty: 1, serials: ['X'] }] })).toBe(
      'SERIAL_NOT_TRACKED',
    );
    expect(await code({ lines: [] })).toBe('VALIDATION_ERROR');
  });
});
