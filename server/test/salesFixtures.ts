// Shared setup for the sales and returns tests: a shop with stock to sell.

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { CheckoutInput } from '@pcshop/shared';
import { products, serialItems } from '../src/db/schema';
import { createStaff, setUpShop, type TestClient } from './helpers';

async function categoryId(client: TestClient, kind: string) {
  const categories = (await client.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  return categories.find((c) => c.kind === kind)!.id;
}

/** Owner creates a priced product. */
export async function newProduct(
  owner: TestClient,
  extra: Record<string, unknown> & { priceSatang?: number | null; kind?: string } = {},
) {
  const { priceSatang = 1_000_00, kind = 'other', ...fields } = extra;
  const res = await owner.post('/api/products', {
    sku: '',
    barcode: '',
    name: 'สินค้าทดสอบ',
    brand: '',
    categoryId: await categoryId(owner, kind),
    condition: 'new',
    warrantyType: 'distributor',
    warrantyMonths: 12,
    supplierWarrantyMonths: 12,
    trackStock: true,
    serialRequired: false,
    minStock: 0,
    notes: '',
    description: '',
    specs: {},
    ...(priceSatang !== null && { pricing: { priceSatang } }),
    ...fields,
  });
  if (res.statusCode !== 201) throw new Error(`create product failed: ${res.body}`);
  return res.json().id as number;
}

/** Owner receives stock (one line). */
export async function receive(
  owner: TestClient,
  productId: number,
  qty: number,
  unitCostSatang: number,
  serials: string[] = [],
) {
  const res = await owner.post('/api/goods-receipts', {
    lines: [{ productId, qty, unitCostSatang, serials }],
  });
  if (res.statusCode !== 201) throw new Error(`receive failed: ${res.body}`);
}

export function serialIds(app: FastifyInstance, productId: number, serialNos: string[]) {
  return serialNos.map(
    (no) =>
      app.database.db
        .select()
        .from(serialItems)
        .all()
        .find((s) => s.productId === productId && s.serialNo === no)!.id,
  );
}

export const productRow = (app: FastifyInstance, id: number) =>
  app.database.db.select().from(products).where(eq(products.id, id)).get()!;

/**
 * A shop with an owner, a staff member, and:
 * - `ram`: 1,690 (regular 1,890, so "-10%"), 10 in stock at cost 1,400
 * - `cpu`: serial product at 6,990, units CPU-1 (cost 6,000) and CPU-2 (cost 6,200)
 * - `service`: installation service at 300, not stock-tracked, cost 0
 */
export async function shopWithStock(app: FastifyInstance) {
  const { owner } = await setUpShop(app);
  const { staff, id: staffId } = await createStaff(owner);
  const ram = await newProduct(owner, { name: 'Kingston Fury 16GB', priceSatang: 1_890_00 });
  await owner.request('PUT', `/api/products/${ram}/pricing`, { priceSatang: 1_690_00 });
  await receive(owner, ram, 10, 1_400_00);

  const cpu = await newProduct(owner, {
    name: 'Ryzen 5 7600',
    kind: 'cpu',
    serialRequired: true,
    warrantyMonths: 36,
    priceSatang: 6_990_00,
  });
  await receive(owner, cpu, 1, 6_000_00, ['CPU-1']);
  await receive(owner, cpu, 1, 6_200_00, ['CPU-2']);

  const service = await newProduct(owner, {
    name: 'ค่าประกอบเครื่อง',
    kind: 'service',
    trackStock: false,
    warrantyType: 'none',
    warrantyMonths: 0,
    priceSatang: 300_00,
  });
  const [cpu1, cpu2] = serialIds(app, cpu, ['CPU-1', 'CPU-2']) as [number, number];
  return { owner, staff, staffId, ram, cpu, service, cpu1, cpu2 };
}

/** A cash checkout that pays exactly `total`. */
export function cashSale(
  items: CheckoutInput['items'],
  total: number,
  extra: Partial<CheckoutInput> = {},
): CheckoutInput {
  return {
    items,
    payment: { method: 'cash', receivedSatang: total },
    expectedTotalSatang: total,
    ...extra,
  };
}
