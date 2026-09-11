import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { products, serialItems, shopSettings, stockMovements } from '../src/db/schema';
import { AppError } from '../src/lib/errors';
import * as stockService from '../src/services/stock.service';
import { createTestApp, setUpShop, type TestClient } from './helpers';

let app: FastifyInstance;
let owner: TestClient;
beforeEach(async () => {
  app = await createTestApp();
  ({ owner } = await setUpShop(app));
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

/** Runs one move in its own transaction, like a service would. */
const move = (input: Omit<stockService.StockMoveInput, 'userId'>) =>
  app.database.db.transaction((tx) => stockService.move(tx, { userId: 1, ...input }));

/** Expects `fn` to throw an AppError with this code. */
function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

const onHand = (id: number) =>
  app.database.db.select().from(products).where(eq(products.id, id)).get()!.onHand;
const movementsOf = (id: number) =>
  app.database.db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, id))
    .orderBy(asc(stockMovements.id))
    .all();
const mismatches = () => stockService.findStockMismatches(app.database.db);

describe('stockService.move — quantity products', () => {
  it('keeps on_hand equal to the ledger with running balances', async () => {
    const id = await newProduct();
    move({ productId: id, qtyChange: 5, type: 'receive', ref: { type: 'test', id: 1 } });
    move({ productId: id, qtyChange: -2, type: 'adjustment', reason: 'นับสต็อก' });

    expect(onHand(id)).toBe(3);
    expect(movementsOf(id).map((m) => [m.qtyChange, m.balanceAfter])).toEqual([
      [5, 5],
      [-2, 3],
    ]);
    expect(mismatches()).toEqual([]);
  });

  it('refuses negative stock and writes nothing', async () => {
    const id = await newProduct();
    move({ productId: id, qtyChange: 1, type: 'receive' });
    expectCode(
      () => move({ productId: id, qtyChange: -2, type: 'adjustment' }),
      'INSUFFICIENT_STOCK',
    );
    expect(onHand(id)).toBe(1);
    expect(movementsOf(id)).toHaveLength(1);
  });

  it('allows negative stock only when the shop enables it', async () => {
    const id = await newProduct();
    app.database.db.update(shopSettings).set({ allowNegativeStock: true }).run();
    move({ productId: id, qtyChange: -2, type: 'adjustment' });
    expect(onHand(id)).toBe(-2);
    expect(mismatches()).toEqual([]);
  });

  it('rejects zero quantities, untracked products, and serials on quantity products', async () => {
    const id = await newProduct();
    expect(() => move({ productId: id, qtyChange: 0, type: 'receive' })).toThrow(RangeError);

    const service = await newProduct({ trackStock: false });
    expectCode(
      () => move({ productId: service, qtyChange: 1, type: 'receive' }),
      'STOCK_NOT_TRACKED',
    );

    expectCode(
      () =>
        move({
          productId: id,
          qtyChange: 1,
          type: 'receive',
          newSerials: [{ serialNo: 'X1', unitCostSatang: 0 }],
        }),
      'SERIAL_NOT_TRACKED',
    );
  });
});

describe('stockService.move — serial products', () => {
  const units = (...serials: string[]) =>
    serials.map((serialNo) => ({ serialNo, unitCostSatang: 1_000 }));

  it('creates units on the way in and moves exactly the chosen units out', async () => {
    const id = await newProduct({ serialRequired: true });
    const { serialIds } = move({
      productId: id,
      qtyChange: 3,
      type: 'receive',
      newSerials: units('A1', 'A2', 'A3'),
    });
    expect(serialIds).toHaveLength(3);

    move({
      productId: id,
      qtyChange: -1,
      type: 'adjustment',
      serials: { ids: [serialIds[1]!], status: 'written_off' },
    });
    const statuses = app.database.db
      .select({ serialNo: serialItems.serialNo, status: serialItems.status })
      .from(serialItems)
      .orderBy(asc(serialItems.id))
      .all();
    expect(statuses).toEqual([
      { serialNo: 'A1', status: 'in_stock' },
      { serialNo: 'A2', status: 'written_off' },
      { serialNo: 'A3', status: 'in_stock' },
    ]);
    expect(onHand(id)).toBe(2);
    expect(mismatches()).toEqual([]);

    // A unit that already left stock can't leave again, and can come back in.
    expectCode(
      () =>
        move({
          productId: id,
          qtyChange: -1,
          type: 'adjustment',
          serials: { ids: [serialIds[1]!], status: 'written_off' },
        }),
      'SERIAL_NOT_IN_STOCK',
    );
    move({
      productId: id,
      qtyChange: 1,
      type: 'return_restock',
      serials: { ids: [serialIds[1]!], status: 'in_stock' },
    });
    expect(onHand(id)).toBe(3);
    expect(mismatches()).toEqual([]);
  });

  it('requires one serial per unit and unique serials per product', async () => {
    const id = await newProduct({ serialRequired: true });
    expectCode(
      () => move({ productId: id, qtyChange: 2, type: 'receive', newSerials: units('B1') }),
      'SERIAL_COUNT_MISMATCH',
    );
    expectCode(
      () => move({ productId: id, qtyChange: 2, type: 'receive', newSerials: units('B1', 'b1') }),
      'SERIAL_DUPLICATE',
    );
    move({ productId: id, qtyChange: 1, type: 'receive', newSerials: units('B1') });
    expectCode(
      () => move({ productId: id, qtyChange: 1, type: 'receive', newSerials: units('b1') }),
      'SERIAL_EXISTS',
    );
    expectCode(
      () => move({ productId: id, qtyChange: -1, type: 'adjustment' }),
      'SERIAL_COUNT_MISMATCH',
    );

    // The same serial on a different product is fine.
    const other = await newProduct({ serialRequired: true });
    move({ productId: other, qtyChange: 1, type: 'receive', newSerials: units('B1') });
    expect(mismatches()).toEqual([]);
  });

  it('never goes negative, even when the shop allows negative stock', async () => {
    const id = await newProduct({ serialRequired: true });
    app.database.db.update(shopSettings).set({ allowNegativeStock: true }).run();
    expectCode(
      () => move({ productId: id, qtyChange: -1, type: 'adjustment' }),
      'SERIAL_COUNT_MISMATCH',
    );
    expect(onHand(id)).toBe(0);
  });
});

describe('findStockMismatches', () => {
  it('reports a cache that disagrees with the ledger or the units', async () => {
    const id = await newProduct({ serialRequired: true });
    move({
      productId: id,
      qtyChange: 1,
      type: 'receive',
      newSerials: [{ serialNo: 'C1', unitCostSatang: 0 }],
    });
    app.database.db.update(serialItems).set({ status: 'sold' }).run();
    expect(mismatches()).toMatchObject([
      { productId: id, onHand: 1, ledgerSum: 1, inStockSerials: 0 },
    ]);

    app.database.db.update(products).set({ onHand: 7 }).where(eq(products.id, id)).run();
    expect(mismatches()[0]).toMatchObject({ onHand: 7, ledgerSum: 1 });
  });
});
