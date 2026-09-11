// PLAN.md §8.3 (5) and CLAUDE.md "Staff never touch money".
// 1. Structural: every route whose body schema has a money field (a key ending in "Satang") must be
//    guarded by an owner-only permission, unless it's a documented exception. New routes are checked
//    automatically through app.routeTable.
// 2. Behavioral: every way staff could try to write money is refused and changes nothing.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { can, createProductInputSchema, productPricingInputSchema } from '@pcshop/shared';
import {
  goodsReceiptItems,
  goodsReceipts,
  products,
  serialItems,
  shopSettings,
} from '../src/db/schema';
import { createTestApp, patch } from './helpers';
import { seedEverything, type SeededShop } from './securityFixtures';

/** Routes staff may call with money fields, and why. Anything else with a money field must be owner-only. */
const STAFF_MONEY_WRITE_EXCEPTIONS: Record<string, string> = {
  'POST /api/goods-receipts':
    'Q2/OQ1: staff may type the supplier unit cost; write-only, and unverified until the owner reviews it',
  'POST /api/products':
    'OQ3: staff may create products, but the `pricing` object is refused for staff in the service',
};

/** Dotted paths of every key ending in "Satang" inside a Zod schema (walks wrappers, arrays, pipes). */
function moneyFields(schema: unknown, path = ''): string[] {
  const def = (schema as { _zod?: { def?: Record<string, unknown> } } | undefined)?._zod?.def;
  if (!def) return [];
  const walk = (child: unknown, childPath = path) => moneyFields(child, childPath);
  switch (def.type) {
    case 'object':
      return Object.entries(def.shape as Record<string, unknown>).flatMap(([key, child]) => {
        const keyPath = path ? `${path}.${key}` : key;
        return [...(key.endsWith('Satang') ? [keyPath] : []), ...walk(child, keyPath)];
      });
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'readonly':
    case 'catch':
      return walk(def.innerType);
    case 'array':
      return walk(def.element, `${path}[]`);
    case 'pipe':
      return [...walk(def.in), ...walk(def.out)];
    case 'union':
      return (def.options as unknown[]).flatMap((option) => walk(option));
    case 'intersection':
      return [...walk(def.left), ...walk(def.right)];
    case 'record':
      return walk(def.valueType, `${path}{}`);
    default:
      return [];
  }
}

let app: FastifyInstance;
let shop: SeededShop;
beforeAll(async () => {
  app = await createTestApp();
  shop = await seedEverything(app);
});
afterAll(() => app.close());

describe('money fields in request bodies', () => {
  it('finds money fields through nested and optional schemas', () => {
    expect(moneyFields(productPricingInputSchema).sort()).toEqual([
      'costSatang',
      'priceSatang',
      'regularPriceSatang',
    ]);
    expect(moneyFields(createProductInputSchema)).toEqual(
      expect.arrayContaining(['pricing.priceSatang', 'pricing.costSatang']),
    );
  });

  it('are accepted only by owner-only routes or documented exceptions', () => {
    const withMoney = app.routeTable
      .filter((r) => r.method !== 'GET' && moneyFields(r.bodySchema).length > 0)
      .map((r) => ({ ...r, key: `${r.method} ${r.url}` }));

    const unguarded = withMoney
      .filter((r) => !r.permissions.some((p) => !can('staff', p)))
      .filter((r) => !STAFF_MONEY_WRITE_EXCEPTIONS[r.key])
      .map((r) => `${r.key} accepts ${moneyFields(r.bodySchema).join(', ')}`);
    expect(
      unguarded,
      'guard these routes with an owner-only requirePermission() preHandler, or document an exception',
    ).toEqual([]);

    const keys = withMoney.map((r) => r.key);
    const stale = Object.keys(STAFF_MONEY_WRITE_EXCEPTIONS).filter((key) => !keys.includes(key));
    expect(stale, 'exceptions for routes that no longer take money fields').toEqual([]);
    // Sanity: the known money endpoints were found.
    expect(keys).toEqual(
      expect.arrayContaining([
        'PUT /api/products/:id/pricing',
        'POST /api/goods-receipts/:id/verify-costs',
        'POST /api/stock/adjustments',
        'PATCH /api/settings',
      ]),
    );
  });
});

describe('staff money writes are refused and change nothing', () => {
  /** Every stored money value, to prove nothing moved. */
  const moneyState = () => ({
    products: app.database.db
      .select({
        id: products.id,
        price: products.priceSatang,
        regular: products.regularPriceSatang,
        cost: products.costSatang,
      })
      .from(products)
      .all(),
    receiptItems: app.database.db
      .select({ id: goodsReceiptItems.id, cost: goodsReceiptItems.unitCostSatang })
      .from(goodsReceiptItems)
      .all(),
    receipts: app.database.db
      .select({
        id: goodsReceipts.id,
        total: goodsReceipts.totalCostSatang,
        costStatus: goodsReceipts.costStatus,
        status: goodsReceipts.status,
      })
      .from(goodsReceipts)
      .all(),
    units: app.database.db
      .select({ id: serialItems.id, cost: serialItems.unitCostSatang })
      .from(serialItems)
      .all(),
    fee: app.database.db
      .select({ fee: shopSettings.defaultAssemblyFeeSatang })
      .from(shopSettings)
      .get(),
  });

  it('pricing, product fields, cost review, voids, adjustments, and settings', async () => {
    const { staff, owner, ids } = shop;
    const before = moneyState();
    const lines = (await owner.get(`/api/goods-receipts/${ids.unverifiedReceipt}`)).json()
      .lines as { id: number }[];
    const categoryId = (await staff.get('/api/categories')).json().items[0].id;

    const attempts: [string, () => Promise<{ statusCode: number }>, number][] = [
      [
        'set price',
        () => staff.request('PUT', `/api/products/${ids.ram}/pricing`, { priceSatang: 1 }),
        403,
      ],
      ['end discount', () => staff.post(`/api/products/${ids.ram}/pricing/end-discount`), 403],
      ['price via update', () => patch(staff, `/api/products/${ids.ram}`, { priceSatang: 1 }), 400],
      [
        'regular price via update',
        () => patch(staff, `/api/products/${ids.ram}`, { regularPriceSatang: 1 }),
        400,
      ],
      ['cost via update', () => patch(staff, `/api/products/${ids.ram}`, { costSatang: 1 }), 400],
      [
        'price on an awaiting-price product',
        () => patch(staff, `/api/products/${ids.awaitingPrice}`, { priceSatang: 1 }),
        400,
      ],
      [
        'create with pricing',
        () =>
          staff.post('/api/products', {
            sku: '',
            barcode: '',
            name: 'x',
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
            pricing: { priceSatang: 1, costSatang: 1 },
          }),
        403,
      ],
      [
        'verify receipt costs',
        () =>
          staff.post(`/api/goods-receipts/${ids.unverifiedReceipt}/verify-costs`, {
            lines: lines.map((l) => ({ itemId: l.id, unitCostSatang: 1 })),
          }),
        403,
      ],
      [
        'void a receipt',
        () => staff.post(`/api/goods-receipts/${ids.verifiedReceipt}/void`, { reason: 'x' }),
        403,
      ],
      [
        'adjust stock with a cost',
        () =>
          staff.post('/api/stock/adjustments', {
            reason: 'x',
            lines: [{ productId: ids.ram, qtyChange: 1, unitCostSatang: 1 }],
          }),
        403,
      ],
      ['assembly fee', () => patch(staff, '/api/settings', { defaultAssemblyFeeSatang: 1 }), 403],
    ];

    for (const [label, attempt, expected] of attempts) {
      expect((await attempt()).statusCode, label).toBe(expected);
    }
    expect(moneyState()).toEqual(before);
  });
});
