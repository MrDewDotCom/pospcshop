import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { bangkokDateKey, findForbiddenKeys } from '@pcshop/shared';
import { createTestApp, patch } from './helpers';
import { cashSale, shopWithStock } from './salesFixtures';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Staff sell 3 RAM + CPU-1 (12,060; cost 10,200), the owner sells 1 RAM (1,690; cost 1,400), and staff
 * take 1 RAM back from the staff sale with a cash refund (1,690; cost 1,400).
 */
async function busyDay() {
  const shop = await shopWithStock(app);
  const staffSale = (
    await shop.staff.post(
      '/api/sales',
      cashSale(
        [
          { productId: shop.ram, qty: 3 },
          { productId: shop.cpu, qty: 1, serialItemIds: [shop.cpu1] },
        ],
        3 * 1_690_00 + 6_990_00,
      ),
    )
  ).json();
  await shop.owner.post('/api/sales', cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00));
  await shop.staff.post(`/api/sales/${staffSale.id}/returns`, {
    reason: 'เสีย',
    refundMethod: 'cash',
    lines: [{ saleItemId: staffSale.lines[0].id, qty: 1 }],
  });
  await patch(shop.owner, `/api/products/${shop.ram}`, { minStock: 6 });
  return shop;
}

describe('dashboard', () => {
  it('gives the owner money: net sales, profit, inventory value, chart, best sellers', async () => {
    const shop = await busyDay();
    const summary = (await shop.owner.get('/api/dashboard/summary')).json();
    const today = bangkokDateKey(Date.now());
    expect(summary).toMatchObject({
      from: today,
      to: today,
      saleCount: 2,
      itemCount: 5,
      mySaleCount: 1,
      myItemCount: 1,
      returnedUnitCount: 1,
      pendingReturnUnits: 1,
      pendingReturnDocs: 1,
      grossSalesSatang: 13_750_00,
      refundTotalSatang: 1_690_00,
      netSalesSatang: 12_060_00,
      // 12,060 − (11,600 − 1,400)
      profitSatang: 1_860_00,
      // RAM: 6 × 1,400; CPU: 1 × 6,100 (average of the two units)
      inventoryValueSatang: 8_400_00 + 6_100_00,
      lowStockCount: 1,
      outOfStockCount: 0,
      unverifiedReceiptCount: 0,
      awaitingPriceCount: 0,
    });
    expect(summary.lowStock).toMatchObject([
      { name: 'Kingston Fury 16GB', onHand: 6, minStock: 6 },
    ]);
    expect(summary.daily).toEqual([{ date: today, saleCount: 2, netSalesSatang: 12_060_00 }]);
    expect(summary.bestSellers).toMatchObject([
      { name: 'Kingston Fury 16GB', qty: 3, revenueSatang: 3 * 1_690_00 },
      { name: 'Ryzen 5 7600', qty: 1, revenueSatang: 6_990_00 },
    ]);
  });

  it('gives staff activity only, never money (Q13)', async () => {
    const shop = await busyDay();
    const summary = (await shop.staff.get('/api/dashboard/summary')).json();
    expect(findForbiddenKeys(summary)).toEqual([]);
    expect(summary).toMatchObject({
      saleCount: 2,
      mySaleCount: 1,
      myItemCount: 4,
      pendingReturnUnits: 1,
    });
    for (const key of ['daily', 'bestSellers', 'inventoryValueSatang', 'unverifiedReceiptCount']) {
      expect(summary, key).not.toHaveProperty(key);
    }
  });

  it('covers a date range with a point per day, and ignores voided sales', async () => {
    const shop = await busyDay();
    const voided = (
      await shop.staff.post('/api/sales', cashSale([{ productId: shop.ram, qty: 1 }], 1_690_00))
    ).json();
    await shop.owner.post(`/api/sales/${voided.id}/void`, { reason: 'คีย์ผิด' });

    const today = bangkokDateKey(Date.now());
    const yesterday = bangkokDateKey(Date.now() - DAY_MS);
    const summary = (
      await shop.owner.get(`/api/dashboard/summary?from=${yesterday}&to=${today}`)
    ).json();
    expect(summary.saleCount).toBe(2);
    expect(summary.daily).toEqual([
      { date: yesterday, saleCount: 0, netSalesSatang: 0 },
      { date: today, saleCount: 2, netSalesSatang: 12_060_00 },
    ]);

    const empty = (
      await shop.owner.get(`/api/dashboard/summary?from=${yesterday}&to=${yesterday}`)
    ).json();
    expect(empty).toMatchObject({
      saleCount: 0,
      netSalesSatang: 0,
      profitSatang: 0,
      bestSellers: [],
    });

    const backwards = await shop.owner.get(`/api/dashboard/summary?from=${today}&to=${yesterday}`);
    expect(backwards.json().error.code).toBe('INVALID_RANGE');
    const tooLong = await shop.owner.get('/api/dashboard/summary?from=2020-01-01&to=2026-01-01');
    expect(tooLong.json().error.code).toBe('RANGE_TOO_LONG');
  });
});
