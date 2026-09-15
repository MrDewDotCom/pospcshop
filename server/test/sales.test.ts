import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { findForbiddenKeys } from '@pcshop/shared';
import { sales, serialItems, stockMovements } from '../src/db/schema';
import { findStockMismatches } from '../src/services/stock.service';
import { createTestApp } from './helpers';
import { cashSale, productRow, shopWithStock } from './salesFixtures';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const saleCount = () => app.database.db.select().from(sales).all().length;

describe('checkout', () => {
  it('sells products, a serial unit, and a service in one transaction', async () => {
    const shop = await shopWithStock(app);
    const customer = (
      await shop.staff.post('/api/customers', { name: 'คุณเอ', phone: '081-111-2222' })
    ).json();

    const total = 2 * 1_690_00 + 6_990_00 + 300_00; // 10,670
    const res = await shop.staff.post('/api/sales', {
      items: [
        { productId: shop.ram, qty: 2 },
        { productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu2] },
        { productId: shop.service, qty: 1 },
      ],
      customerId: customer.id,
      note: 'ลูกค้ารับเอง',
      payment: { method: 'cash', receivedSatang: 11_000_00 },
      expectedTotalSatang: total,
    });
    expect(res.statusCode).toBe(201);
    const sale = res.json();
    expect(findForbiddenKeys(sale)).toEqual([]); // staff never see cost or profit
    expect(sale).toMatchObject({
      docNo: expect.stringMatching(/^RC\d{4}-0001$/),
      status: 'paid',
      source: 'pos',
      customerId: customer.id,
      customerName: 'คุณเอ',
      customerPhone: '081-111-2222',
      totalSatang: total,
      savingsSatang: 2 * 200_00,
      refundedSatang: 0,
      itemCount: 4,
      paymentMethod: 'cash',
      salespersonName: 'พนักงาน ทดสอบ',
      note: 'ลูกค้ารับเอง',
      payment: {
        method: 'cash',
        amountSatang: total,
        receivedSatang: 11_000_00,
        changeSatang: 330_00,
      },
      returns: [],
    });
    expect(sale.lines).toMatchObject([
      {
        kind: 'product',
        name: 'Kingston Fury 16GB',
        qty: 2,
        unitPriceSatang: 1_690_00,
        regularPriceSatang: 1_890_00,
        lineTotalSatang: 3_380_00,
        warrantyType: 'distributor',
        warrantyMonths: 12,
        serials: [],
      },
      {
        name: 'Ryzen 5 7600',
        regularPriceSatang: null,
        serialRequired: true,
        serials: [{ id: shop.cpu2, serialNo: 'CPU-2', returned: false }],
      },
      { kind: 'service', name: 'ค่าประกอบเครื่อง', lineTotalSatang: 300_00 },
    ]);
    expect(sale.lines[1].serials[0].warrantyExpiresAt).not.toBeNull();
    expect(sale.lines[2].serials).toEqual([]);

    // The owner sees cost and profit. The serial line uses that unit's own cost (P22).
    const ownerView = (await shop.owner.get(`/api/sales/${sale.id}`)).json();
    expect(ownerView.lines.map((l: { unitCostSatang: number }) => l.unitCostSatang)).toEqual([
      1_400_00, 6_200_00, 0,
    ]);
    expect(ownerView).toMatchObject({
      totalCostSatang: 2 * 1_400_00 + 6_200_00,
      profitSatang: total - (2 * 1_400_00 + 6_200_00),
    });

    // Stock left through the ledger; the service had none to take.
    expect(productRow(app, shop.ram).onHand).toBe(8);
    expect(productRow(app, shop.cpu).onHand).toBe(1);
    const unit = app.database.db
      .select()
      .from(serialItems)
      .where(eq(serialItems.id, shop.cpu2))
      .get()!;
    expect(unit.status).toBe('sold');
    const moves = app.database.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.type, 'sale'))
      .all();
    expect(moves.map((m) => [m.productId, m.qtyChange, m.refDocNo])).toEqual([
      [shop.ram, -2, sale.docNo],
      [shop.cpu, -1, sale.docNo],
    ]);
    expect(findStockMismatches(app.database.db)).toEqual([]);

    // The customer's history and purchase count pick it up.
    const history = (await shop.staff.get(`/api/customers/${customer.id}/history`)).json();
    expect(history.sales.map((s: { docNo: string }) => s.docNo)).toEqual([sale.docNo]);
    expect(findForbiddenKeys(history)).toEqual([]);
    expect(
      (await shop.owner.get(`/api/customers/${customer.id}/history`)).json().sales[0],
    ).toMatchObject({ profitSatang: ownerView.profitSatang });
    expect((await shop.staff.get(`/api/customers/${customer.id}`)).json().saleCount).toBe(1);
  });

  it('accepts a transfer only for the exact total, and cash only when it covers the total', async () => {
    const shop = await shopWithStock(app);
    const items = [{ productId: shop.ram, qty: 1 }];
    const pay = (method: 'cash' | 'transfer', receivedSatang: number) =>
      shop.staff.post('/api/sales', {
        items,
        payment: { method, receivedSatang },
        expectedTotalSatang: 1_690_00,
      });

    for (const [method, received] of [
      ['transfer', 1_700_00],
      ['transfer', 1_600_00],
      ['cash', 1_689_99],
    ] as const) {
      const res = await pay(method, received);
      expect(res.statusCode, `${method} ${received}`).toBe(400);
      expect(res.json().error.code).toBe('PAYMENT_INVALID');
    }
    expect(saleCount()).toBe(0);
    expect(productRow(app, shop.ram).onHand).toBe(10);

    const transfer = await pay('transfer', 1_690_00);
    expect(transfer.statusCode).toBe(201);
    expect(transfer.json().payment).toMatchObject({ method: 'transfer', changeSatang: 0 });
    // Refused attempts don't use up document numbers.
    expect(transfer.json().docNo).toMatch(/-0001$/);
  });

  it('refuses when a price changed since the cart was built (P25)', async () => {
    const shop = await shopWithStock(app);
    await shop.owner.request('PUT', `/api/products/${shop.ram}/pricing`, { priceSatang: 1_590_00 });
    const res = await shop.staff.post(
      '/api/sales',
      cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: { totalSatang: 1_590_00 },
    });
    expect(saleCount()).toBe(0);
  });

  it('validates products, stock, and serial units', async () => {
    const shop = await shopWithStock(app);
    const { newProduct } = await import('./salesFixtures');
    const awaiting = await newProduct(shop.owner, { priceSatang: null });
    const archived = await newProduct(shop.owner, { name: 'เลิกขาย' });
    await shop.owner.post(`/api/products/${archived}/archive`);

    const attempt = async (items: object[], total: number) => {
      const res = await shop.staff.post('/api/sales', cashSale(items as never, total));
      return [res.statusCode, res.json().error?.code];
    };
    expect(await attempt([{ productId: awaiting, qty: 1 }], 0)).toEqual([400, 'AWAITING_PRICE']);
    expect(await attempt([{ productId: archived, qty: 1 }], 1_000_00)).toEqual([
      400,
      'PRODUCT_ARCHIVED',
    ]);
    expect(await attempt([{ productId: 9999, qty: 1 }], 0)).toEqual([400, 'PRODUCT_NOT_FOUND']);
    expect(await attempt([{ productId: shop.ram, qty: 11 }], 11 * 1_690_00)).toEqual([
      409,
      'INSUFFICIENT_STOCK',
    ]);
    expect(
      await attempt(
        [
          { productId: shop.ram, qty: 1 },
          { productId: shop.ram, qty: 1 },
        ],
        2 * 1_690_00,
      ),
    ).toEqual([400, 'DUPLICATE_PRODUCT_LINE']);
    expect(
      await attempt([{ productId: shop.cpu, qty: 2, serialItemIds: [shop.cpu1] }], 2 * 6_990_00),
    ).toEqual([400, 'SERIAL_COUNT_MISMATCH']);
    expect(
      await attempt([{ productId: shop.ram, qty: 1, serialItemIds: [shop.cpu1] }], 1_690_00),
    ).toEqual([400, 'SERIAL_NOT_TRACKED']);
    expect(
      await attempt([{ productId: shop.cpu, qty: 1, serialItemIds: [99999] }], 6_990_00),
    ).toEqual([400, 'SERIAL_NOT_FOUND']);
    expect(await attempt([], 0)).toEqual([400, 'VALIDATION_ERROR']);

    // A unit can be sold only once.
    expect(
      await attempt([{ productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] }], 6_990_00),
    ).toEqual([201, undefined]);
    expect(
      await attempt([{ productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] }], 6_990_00),
    ).toEqual([409, 'SERIAL_NOT_IN_STOCK']);

    expect(saleCount()).toBe(1);
    expect(findStockMismatches(app.database.db)).toEqual([]);
  });

  it('refuses an archived or unknown customer', async () => {
    const shop = await shopWithStock(app);
    const customer = (await shop.owner.post('/api/customers', { name: 'ย้ายไปแล้ว' })).json();
    await shop.owner.post(`/api/customers/${customer.id}/archive`);
    const items = [{ productId: shop.ram, qty: 1 }];
    const archived = await shop.staff.post(
      '/api/sales',
      cashSale(items, 1_690_00, { customerId: customer.id }),
    );
    expect(archived.json().error.code).toBe('CUSTOMER_ARCHIVED');
    const unknown = await shop.staff.post(
      '/api/sales',
      cashSale(items, 1_690_00, { customerId: 999 }),
    );
    expect(unknown.json().error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('keeps the snapshot when the product or customer changes later', async () => {
    const shop = await shopWithStock(app);
    const customer = (await shop.owner.post('/api/customers', { name: 'ชื่อเดิม' })).json();
    const sale = (
      await shop.staff.post(
        '/api/sales',
        cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00, { customerId: customer.id }),
      )
    ).json();

    await shop.owner.request('PATCH', `/api/products/${shop.ram}`, { name: 'ชื่อใหม่' });
    await shop.owner.request('PUT', `/api/products/${shop.ram}/pricing`, { priceSatang: 999_00 });
    await shop.owner.request('PATCH', `/api/customers/${customer.id}`, { name: 'ชื่อลูกค้าใหม่' });

    const again = (await shop.staff.get(`/api/sales/${sale.id}`)).json();
    expect(again.customerName).toBe('ชื่อเดิม');
    expect(again.lines[0]).toMatchObject({
      name: 'Kingston Fury 16GB',
      unitPriceSatang: 1_690_00,
      regularPriceSatang: 1_890_00,
    });
  });

  it('lists and searches sales', async () => {
    const shop = await shopWithStock(app);
    const customer = (
      await shop.owner.post('/api/customers', { name: 'คุณบี', phone: '089-123-4567' })
    ).json();
    const first = (
      await shop.staff.post(
        '/api/sales',
        cashSale([{ productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] }], 6_990_00, {
          customerId: customer.id,
        }),
      )
    ).json();
    const second = (
      await shop.owner.post('/api/sales', cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00))
    ).json();

    const docNos = async (client = shop.staff, query = '') =>
      (await client.get(`/api/sales${query}`)).json().items.map((s: { docNo: string }) => s.docNo);
    expect(await docNos()).toEqual([second.docNo, first.docNo]); // newest first
    expect(await docNos(shop.staff, '?mine=true')).toEqual([first.docNo]);
    expect(await docNos(shop.owner, '?mine=true')).toEqual([second.docNo]);
    expect(await docNos(shop.staff, '?q=CPU-1')).toEqual([first.docNo]); // by serial
    expect(await docNos(shop.staff, '?q=0891234567')).toEqual([first.docNo]); // by phone digits
    expect(await docNos(shop.staff, `?q=${second.docNo}`)).toEqual([second.docNo]);
    expect(await docNos(shop.staff, `?customerId=${customer.id}`)).toEqual([first.docNo]);
    expect(await docNos(shop.staff, '?paymentMethod=transfer')).toEqual([]);
    expect(await docNos(shop.staff, '?from=2000-01-01&to=2000-01-31')).toEqual([]);

    const staffList = (await shop.staff.get('/api/sales')).json();
    expect(findForbiddenKeys(staffList)).toEqual([]);
    const ownerList = (await shop.owner.get('/api/sales')).json();
    expect(ownerList.items[0]).toMatchObject({ totalCostSatang: 1_400_00, profitSatang: 290_00 });
    expect((await shop.staff.get('/api/sales/9999')).statusCode).toBe(404);
  });
});

describe('void sale', () => {
  it('owner voids: stock and serial units come back, payment voided, audited', async () => {
    const shop = await shopWithStock(app);
    const customer = (await shop.owner.post('/api/customers', { name: 'คุณซี' })).json();
    const sale = (
      await shop.staff.post(
        '/api/sales',
        cashSale(
          [
            { productId: shop.ram, qty: 3 },
            { productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] },
            { productId: shop.service, qty: 1 },
          ],
          3 * 1_690_00 + 6_990_00 + 300_00,
          { customerId: customer.id },
        ),
      )
    ).json();
    expect(productRow(app, shop.ram).onHand).toBe(7);
    // Receive more RAM at a different cost in between: the voided units come back at their own cost.
    await shop.owner.post('/api/goods-receipts', {
      lines: [{ productId: shop.ram, qty: 7, unitCostSatang: 1_600_00 }],
    });
    // 7 × 1,400 + 7 × 1,600 over 14 = 1,500
    expect(productRow(app, shop.ram).costSatang).toBe(1_500_00);

    expect((await shop.staff.post(`/api/sales/${sale.id}/void`, { reason: 'x' })).statusCode).toBe(
      403,
    );
    expect((await shop.owner.post(`/api/sales/${sale.id}/void`, { reason: ' ' })).statusCode).toBe(
      400,
    );

    const res = await shop.owner.post(`/api/sales/${sale.id}/void`, { reason: 'ลูกค้าเปลี่ยนใจ' });
    expect(res.statusCode).toBe(200);
    const voided = res.json();
    expect(voided).toMatchObject({
      status: 'voided',
      voidReason: 'ลูกค้าเปลี่ยนใจ',
      voidedByName: 'สมชาย ใจดี',
      profitSatang: 0,
      payment: { voidedAt: expect.any(String) },
    });

    // 14 + 3 back; (14 × 1,500 + 3 × 1,400) / 17 = 1,482.35… → 1,482.35 (half-up)
    expect(productRow(app, shop.ram)).toMatchObject({ onHand: 17, costSatang: 1_482_35 });
    expect(productRow(app, shop.cpu).onHand).toBe(2);
    const unit = app.database.db
      .select()
      .from(serialItems)
      .where(eq(serialItems.id, shop.cpu1))
      .get()!;
    expect(unit.status).toBe('in_stock');
    const voidMoves = app.database.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.type, 'void'))
      .all();
    expect(voidMoves.map((m) => [m.productId, m.qtyChange, m.reason, m.refDocNo])).toEqual([
      [shop.ram, 3, 'ลูกค้าเปลี่ยนใจ', sale.docNo],
      [shop.cpu, 1, 'ลูกค้าเปลี่ยนใจ', sale.docNo],
    ]);
    expect(findStockMismatches(app.database.db)).toEqual([]);

    const audit = (await shop.owner.get('/api/audit-logs')).json().items;
    expect(audit[0]).toMatchObject({ action: 'sale.void' });

    // The unit can be sold again; the voided sale no longer counts as a purchase.
    expect(
      (
        await shop.staff.post(
          '/api/sales',
          cashSale([{ productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] }], 6_990_00),
        )
      ).statusCode,
    ).toBe(201);
    expect((await shop.owner.get(`/api/customers/${customer.id}`)).json().saleCount).toBe(0);
    const voidedList = (await shop.owner.get('/api/sales?status=voided')).json();
    expect(voidedList.items.map((s: { docNo: string }) => s.docNo)).toEqual([sale.docNo]);

    const again = await shop.owner.post(`/api/sales/${sale.id}/void`, { reason: 'ซ้ำ' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SALE_VOIDED');
  });
});

describe('correlated subqueries', () => {
  // Drizzle leaves columns unqualified in single-table SELECT lists; a subquery that referenced the
  // outer row that way bound to the inner table and only worked when the ids happened to match.
  it('counts purchases per customer when customer and sale ids differ', async () => {
    const shop = await shopWithStock(app);
    const first = (await shop.owner.post('/api/customers', { name: 'คนแรก' })).json();
    const second = (await shop.owner.post('/api/customers', { name: 'คนที่สอง' })).json();
    await shop.staff.post(
      '/api/sales',
      cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00, { customerId: second.id }),
    );
    const counts = (await shop.owner.get('/api/customers'))
      .json()
      .items.map((c: { name: string; saleCount: number; lastSaleAt: string | null }) => [
        c.name,
        c.saleCount,
        c.lastSaleAt !== null,
      ]);
    expect(counts).toEqual([
      ['คนที่สอง', 1, true],
      ['คนแรก', 0, false],
    ]);
    expect(first.id).not.toBe(second.id);
  });
});
