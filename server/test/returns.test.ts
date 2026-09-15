import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { findForbiddenKeys } from '@pcshop/shared';
import { serialItems, stockMovements } from '../src/db/schema';
import { findStockMismatches } from '../src/services/stock.service';
import { createTestApp, patch } from './helpers';
import { cashSale, productRow, shopWithStock } from './salesFixtures';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

/** A shop with one paid sale: 3 RAM, both CPU units, and the installation service. */
async function shopWithSale() {
  const shop = await shopWithStock(app);
  const total = 3 * 1_690_00 + 2 * 6_990_00 + 300_00;
  const sale = (
    await shop.staff.post(
      '/api/sales',
      cashSale(
        [
          { productId: shop.ram, qty: 3 },
          { productId: shop.cpu, qty: 2, serialItemIds: [shop.cpu1, shop.cpu2] },
          { productId: shop.service, qty: 1 },
        ],
        total,
      ),
    )
  ).json();
  const [ramLine, cpuLine, serviceLine] = sale.lines as { id: number }[];
  return {
    ...shop,
    sale,
    ramLine: ramLine!.id,
    cpuLine: cpuLine!.id,
    serviceLine: serviceLine!.id,
  };
}

const unitStatus = (id: number) =>
  app.database.db.select().from(serialItems).where(eq(serialItems.id, id)).get()!.status;

describe('returns', () => {
  it('staff record a return: units go into quarantine, stock does not change', async () => {
    const shop = await shopWithSale();
    const res = await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
      reason: 'ลูกค้าเปลี่ยนใจ',
      refundMethod: 'cash',
      lines: [
        { saleItemId: shop.ramLine, qty: 1 },
        { saleItemId: shop.cpuLine, qty: 1, serialItemIds: [shop.cpu2] },
      ],
    });
    expect(res.statusCode).toBe(201);
    const ret = res.json();
    expect(findForbiddenKeys(ret)).toEqual([]);
    expect(ret).toMatchObject({
      docNo: expect.stringMatching(/^RT\d{4}-0001$/),
      saleDocNo: shop.sale.docNo,
      reason: 'ลูกค้าเปลี่ยนใจ',
      refundMethod: 'cash',
      refundSatang: 1_690_00 + 6_990_00,
      maxRefundSatang: 1_690_00 + 6_990_00,
      itemCount: 2,
      pendingCount: 2,
      createdByName: 'พนักงาน ทดสอบ',
    });
    expect(ret.lines).toMatchObject([
      { productName: 'Kingston Fury 16GB', qty: 1, serialNo: null, disposition: 'pending' },
      { productName: 'Ryzen 5 7600', qty: 1, serialNo: 'CPU-2', disposition: 'pending' },
    ]);

    // Quarantine: sellable stock is unchanged and the unit is marked as returned.
    expect(productRow(app, shop.ram).onHand).toBe(7);
    expect(productRow(app, shop.cpu).onHand).toBe(0);
    expect(unitStatus(shop.cpu2)).toBe('customer_returned');
    expect(unitStatus(shop.cpu1)).toBe('sold');
    const movements = app.database.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.type, 'return_restock'))
      .all();
    expect(movements).toEqual([]);
    expect(findStockMismatches(app.database.db)).toEqual([]);

    // The sale shows it: returned quantities, the returned serial, the refund, and (owner) profit.
    const sale = (await shop.owner.get(`/api/sales/${shop.sale.id}`)).json();
    expect(sale.refundedSatang).toBe(1_690_00 + 6_990_00);
    expect(sale.returns).toMatchObject([{ docNo: ret.docNo, itemCount: 2 }]);
    expect(sale.lines.map((l: { returnedQty: number }) => l.returnedQty)).toEqual([1, 1, 0]);
    expect(sale.lines[1].serials).toMatchObject([
      { serialNo: 'CPU-1', returned: false },
      { serialNo: 'CPU-2', returned: true },
    ]);
    // Profit: (total − refund) − (cost − returned cost)
    const total = 3 * 1_690_00 + 2 * 6_990_00 + 300_00;
    const cost = 3 * 1_400_00 + 6_000_00 + 6_200_00;
    expect(sale.profitSatang).toBe(total - (1_690_00 + 6_990_00) - (cost - (1_400_00 + 6_100_00)));

    // Owner sees each returned line's cost; staff never do.
    const ownerRet = (await shop.owner.get(`/api/returns/${ret.id}`)).json();
    expect(ownerRet.lines.map((l: { unitCostSatang: number }) => l.unitCostSatang)).toEqual([
      1_400_00,
      6_100_00, // the CPU line's cost is the average of its two units (P22)
    ]);
    expect(findForbiddenKeys((await shop.staff.get(`/api/returns/${ret.id}`)).json())).toEqual([]);

    const audit = (await shop.owner.get('/api/audit-logs')).json().items;
    expect(audit[0]).toMatchObject({ action: 'return.create' });
  });

  it('limits what can be returned', async () => {
    const shop = await shopWithSale();
    const attempt = async (lines: object[], refundMethod = 'cash') => {
      const res = await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
        reason: 'เสีย',
        refundMethod,
        lines,
      });
      return [res.statusCode, res.json().error?.code];
    };

    expect(await attempt([{ saleItemId: shop.ramLine, qty: 4 }])).toEqual([
      400,
      'RETURN_QTY_TOO_HIGH',
    ]);
    expect(await attempt([{ saleItemId: shop.serviceLine, qty: 1 }])).toEqual([
      400,
      'NOT_RETURNABLE',
    ]);
    expect(await attempt([{ saleItemId: shop.cpuLine, qty: 1 }])).toEqual([
      400,
      'SERIAL_COUNT_MISMATCH',
    ]);
    expect(await attempt([{ saleItemId: shop.cpuLine, qty: 1, serialItemIds: [99999] }])).toEqual([
      400,
      'SERIAL_NOT_RETURNABLE',
    ]);
    expect(
      await attempt([{ saleItemId: shop.ramLine, qty: 1, serialItemIds: [shop.cpu1] }]),
    ).toEqual([400, 'SERIAL_NOT_TRACKED']);
    expect(await attempt([{ saleItemId: 99999, qty: 1 }])).toEqual([400, 'SALE_ITEM_NOT_FOUND']);
    expect(
      await attempt([
        { saleItemId: shop.ramLine, qty: 1 },
        { saleItemId: shop.ramLine, qty: 1 },
      ]),
    ).toEqual([400, 'DUPLICATE_RETURN_LINE']);
    expect(await attempt([])).toEqual([400, 'VALIDATION_ERROR']);

    // Return 2 RAM and CPU-1, then only 1 RAM is left and CPU-1 can't come back twice.
    expect(
      await attempt([
        { saleItemId: shop.ramLine, qty: 2 },
        { saleItemId: shop.cpuLine, qty: 1, serialItemIds: [shop.cpu1] },
      ]),
    ).toEqual([201, undefined]);
    expect(await attempt([{ saleItemId: shop.ramLine, qty: 2 }])).toEqual([
      400,
      'RETURN_QTY_TOO_HIGH',
    ]);
    expect(
      await attempt([{ saleItemId: shop.cpuLine, qty: 1, serialItemIds: [shop.cpu1] }]),
    ).toEqual([400, 'SERIAL_NOT_RETURNABLE']);
    expect(await attempt([{ saleItemId: shop.ramLine, qty: 1 }], 'none')).toEqual([201, undefined]);
    expect(await attempt([{ saleItemId: shop.ramLine, qty: 1 }])).toEqual([
      400,
      'RETURN_QTY_TOO_HIGH',
    ]);
  });

  it('records no refund when the customer gets no money back', async () => {
    const shop = await shopWithSale();
    const ret = (
      await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
        reason: 'ส่งซ่อมตามประกัน',
        refundMethod: 'none',
        lines: [{ saleItemId: shop.ramLine, qty: 1 }],
      })
    ).json();
    expect(ret).toMatchObject({ refundSatang: 0, maxRefundSatang: 1_690_00 });
    expect((await shop.owner.get(`/api/sales/${shop.sale.id}`)).json().refundedSatang).toBe(0);
    // With no refund, the owner has nothing to adjust.
    const res = await patch(shop.owner, `/api/returns/${ret.id}/refund`, { refundSatang: 100 });
    expect(res.json().error.code).toBe('NO_REFUND');
  });

  it('only the owner changes the refund, up to what the customer paid (P21)', async () => {
    const shop = await shopWithSale();
    const ret = (
      await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
        reason: 'กล่องหาย',
        refundMethod: 'transfer',
        lines: [
          { saleItemId: shop.ramLine, qty: 2 },
          { saleItemId: shop.cpuLine, qty: 1, serialItemIds: [shop.cpu1] },
        ],
      })
    ).json();
    const max = 2 * 1_690_00 + 6_990_00;
    expect(ret.refundSatang).toBe(max);

    expect(
      (await patch(shop.staff, `/api/returns/${ret.id}/refund`, { refundSatang: 0 })).statusCode,
    ).toBe(403);
    const tooHigh = await patch(shop.owner, `/api/returns/${ret.id}/refund`, {
      refundSatang: max + 1,
    });
    expect(tooHigh.json().error.code).toBe('REFUND_TOO_HIGH');

    const res = await patch(shop.owner, `/api/returns/${ret.id}/refund`, {
      refundSatang: 5_000_00,
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated).toMatchObject({
      refundSatang: 5_000_00,
      refundAdjustedByName: 'สมชาย ใจดี',
      refundAdjustedAt: expect.any(String),
    });
    const shares = updated.lines.map((l: { refundSatang: number }) => l.refundSatang);
    expect(shares.reduce((a: number, b: number) => a + b, 0)).toBe(5_000_00);
    // 5,000 over lines worth 3,380 and 6,990 (10,370): 1,629.70 and 3,370.30
    expect(shares).toEqual([1_629_70, 3_370_30]);
    expect((await shop.owner.get(`/api/sales/${shop.sale.id}`)).json().refundedSatang).toBe(
      5_000_00,
    );

    const audit = (await shop.owner.get('/api/audit-logs')).json().items;
    expect(audit[0]).toMatchObject({ action: 'return.refund_change' });
  });

  it('blocks voiding a sale that has returns, and returns against a voided sale', async () => {
    const shop = await shopWithSale();
    await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
      reason: 'เสีย',
      refundMethod: 'cash',
      lines: [{ saleItemId: shop.ramLine, qty: 1 }],
    });
    const voidRes = await shop.owner.post(`/api/sales/${shop.sale.id}/void`, { reason: 'x' });
    expect(voidRes.json().error.code).toBe('SALE_HAS_RETURNS');

    const other = (
      await shop.staff.post('/api/sales', cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00))
    ).json();
    await shop.owner.post(`/api/sales/${other.id}/void`, { reason: 'คีย์ผิด' });
    const res = await shop.staff.post(`/api/sales/${other.id}/returns`, {
      reason: 'เสีย',
      refundMethod: 'cash',
      lines: [{ saleItemId: other.lines[0].id, qty: 1 }],
    });
    expect(res.json().error.code).toBe('SALE_VOIDED');
  });

  it('lists and searches returns', async () => {
    const shop = await shopWithSale();
    const first = (
      await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
        reason: 'เสีย',
        refundMethod: 'cash',
        lines: [{ saleItemId: shop.cpuLine, qty: 1, serialItemIds: [shop.cpu1] }],
      })
    ).json();
    const second = (
      await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
        reason: 'เปลี่ยนใจ',
        refundMethod: 'none',
        lines: [{ saleItemId: shop.ramLine, qty: 1 }],
      })
    ).json();
    const docNos = async (query = '') =>
      (await shop.staff.get(`/api/returns${query}`))
        .json()
        .items.map((r: { docNo: string }) => r.docNo);
    expect(await docNos()).toEqual([second.docNo, first.docNo]);
    expect(await docNos('?q=CPU-1')).toEqual([first.docNo]);
    expect(await docNos(`?q=${shop.sale.docNo}`)).toEqual([second.docNo, first.docNo]);
    expect(await docNos(`?saleId=${shop.sale.id}&pending=true`)).toEqual([
      second.docNo,
      first.docNo,
    ]);
    expect((await shop.staff.get('/api/returns/9999')).statusCode).toBe(404);
  });
});

describe('resolving returned units', () => {
  async function returned() {
    const shop = await shopWithSale();
    const ret = (
      await shop.staff.post(`/api/sales/${shop.sale.id}/returns`, {
        reason: 'เสีย',
        refundMethod: 'cash',
        lines: [
          { saleItemId: shop.ramLine, qty: 2 },
          { saleItemId: shop.cpuLine, qty: 2, serialItemIds: [shop.cpu1, shop.cpu2] },
        ],
      })
    ).json();
    const [ramItem, cpu1Item, cpu2Item] = ret.lines as { id: number; serialItemId: number }[];
    const resolve = (itemId: number, disposition: string, note = '') =>
      shop.staff.post(`/api/returns/${ret.id}/items/${itemId}/resolve`, { disposition, note });
    return {
      ...shop,
      ret,
      ramItem: ramItem!.id,
      cpu1Item: cpu1Item!.id,
      cpu2Item: cpu2Item!.id,
      resolve,
    };
  }

  const autoTagLabels = async (
    client: { get: (url: string) => Promise<{ json: () => unknown }> },
    id: number,
  ) =>
    (
      (await client.get(`/api/products/${id}`)).json() as {
        autoTags: { key: string; label: string }[];
      }
    ).autoTags
      .filter((t) => t.key === 'returned')
      .map((t) => t.label);

  it('restock puts units back into sellable stock through the ledger', async () => {
    const shop = await returned();
    expect(await autoTagLabels(shop.staff, shop.ram)).toEqual(['สินค้าคืน 2 ชิ้น']);
    expect(productRow(app, shop.ram)).toMatchObject({ onHand: 7, costSatang: 1_400_00 });

    const res = await shop.resolve(shop.ramItem, 'restocked', 'ตรวจแล้วใช้งานได้');
    expect(res.statusCode).toBe(200);
    const line = res.json().lines[0];
    expect(line).toMatchObject({
      disposition: 'restocked',
      resolutionNote: 'ตรวจแล้วใช้งานได้',
      resolvedByName: 'พนักงาน ทดสอบ',
    });
    expect(res.json().pendingCount).toBe(2);
    expect(productRow(app, shop.ram)).toMatchObject({ onHand: 9, costSatang: 1_400_00 });
    const restock = app.database.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.type, 'return_restock'))
      .all();
    expect(restock.map((m) => [m.productId, m.qtyChange, m.refDocNo])).toEqual([
      [shop.ram, 2, shop.ret.docNo],
    ]);
    expect(await autoTagLabels(shop.staff, shop.ram)).toEqual([]);

    // A serial unit comes back in stock marked "was returned", and can be sold again.
    await shop.resolve(shop.cpu1Item, 'restocked');
    const unit = app.database.db
      .select()
      .from(serialItems)
      .where(eq(serialItems.id, shop.cpu1))
      .get()!;
    expect(unit).toMatchObject({ status: 'in_stock', wasReturned: true });
    expect(productRow(app, shop.cpu).onHand).toBe(1);
    const serials = (
      await shop.staff.get(`/api/products/${shop.cpu}/serials?status=in_stock`)
    ).json();
    expect(serials.items).toMatchObject([{ serialNo: 'CPU-1', wasReturned: true }]);
    expect(
      (
        await shop.staff.post(
          '/api/sales',
          cashSale([{ productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] }], 6_990_00),
        )
      ).statusCode,
    ).toBe(201);
    expect(findStockMismatches(app.database.db)).toEqual([]);
  });

  it('send to claim and write off change no stock', async () => {
    const shop = await returned();
    expect((await shop.resolve(shop.cpu1Item, 'sent_to_claim', 'ส่ง Synnex')).statusCode).toBe(200);
    expect((await shop.resolve(shop.cpu2Item, 'written_off', 'เสียหายหนัก')).statusCode).toBe(200);
    expect((await shop.resolve(shop.ramItem, 'written_off')).statusCode).toBe(200);

    expect(unitStatus(shop.cpu1)).toBe('in_claim');
    expect(unitStatus(shop.cpu2)).toBe('written_off');
    expect(productRow(app, shop.cpu).onHand).toBe(0);
    expect(productRow(app, shop.ram).onHand).toBe(7);
    expect(
      app.database.db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.type, 'return_restock'))
        .all(),
    ).toEqual([]);
    const detail = (await shop.staff.get(`/api/returns/${shop.ret.id}`)).json();
    expect(detail.pendingCount).toBe(0);
    expect(detail.lines.map((l: { disposition: string }) => l.disposition)).toEqual([
      'written_off',
      'sent_to_claim',
      'written_off',
    ]);
    expect((await shop.staff.get('/api/returns?pending=true')).json().total).toBe(0);
    expect(findStockMismatches(app.database.db)).toEqual([]);

    const audit = (await shop.owner.get('/api/audit-logs')).json().items;
    expect(audit.filter((a: { action: string }) => a.action === 'return.resolve')).toHaveLength(3);
  });

  it('resolves each unit only once', async () => {
    const shop = await returned();
    await shop.resolve(shop.ramItem, 'restocked');
    const again = await shop.resolve(shop.ramItem, 'written_off');
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ALREADY_RESOLVED');
    expect(productRow(app, shop.ram).onHand).toBe(9);

    expect((await shop.resolve(99999, 'restocked')).statusCode).toBe(404);
    expect((await shop.resolve(shop.cpu1Item, 'pending')).statusCode).toBe(400);
    const other = await shop.staff.post(`/api/returns/9999/items/${shop.cpu1Item}/resolve`, {
      disposition: 'restocked',
    });
    expect(other.statusCode).toBe(404);
  });
});
