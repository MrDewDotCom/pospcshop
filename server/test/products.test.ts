import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { findForbiddenKeys } from '@pcshop/shared';
import { auditLogs, products, serialItems } from '../src/db/schema';
import {
  createStaff,
  createTestApp,
  patch,
  setUpShop,
  uploadImage,
  type TestClient,
} from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

async function categoryId(client: TestClient, kind: string): Promise<number> {
  const items = (await client.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  return items.find((c) => c.kind === kind)!.id;
}

const baseProduct = (catId: number, extra: Record<string, unknown> = {}) => ({
  sku: '',
  barcode: '',
  name: 'AMD Ryzen 5 7600',
  brand: 'AMD',
  categoryId: catId,
  condition: 'new',
  warrantyType: 'distributor',
  warrantyMonths: 36,
  supplierWarrantyMonths: 36,
  trackStock: true,
  serialRequired: true,
  minStock: 2,
  notes: '',
  description: '',
  specs: { socket: 'AM5', cores: 6 },
  ...extra,
});

async function createProduct(client: TestClient, body: Record<string, unknown>) {
  const res = await client.post('/api/products', body);
  if (res.statusCode !== 201) throw new Error(`create product failed: ${res.body}`);
  return res.json() as { id: number; sku: string; priceSatang: number | null } & Record<
    string,
    unknown
  >;
}

const setOnHand = (id: number, onHand: number) =>
  app.database.db.update(products).set({ onHand }).where(eq(products.id, id)).run();

describe('creating products', () => {
  it('owner creates with a price: SKU is generated, specs cleaned, price history recorded', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await categoryId(owner, 'cpu');
    const created = await createProduct(
      owner,
      baseProduct(cpu, {
        specs: { socket: 'AM5', cores: 6, chipset: 'ignored', threads: '' },
        pricing: { priceSatang: 699_000, costSatang: 600_000 },
      }),
    );
    expect(created).toMatchObject({
      sku: 'CPU-0001',
      barcode: null,
      priceSatang: 699_000,
      regularPriceSatang: null,
      costSatang: 600_000,
      categoryKind: 'cpu',
      specs: { socket: 'AM5', cores: 6 },
    });

    const second = await createProduct(owner, baseProduct(cpu, { name: 'Ryzen 7 7700' }));
    expect(second.sku).toBe('CPU-0002');

    const history = (await owner.get(`/api/products/${created.id}/price-history`)).json().items;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ priceSatang: 699_000, changedByName: 'สมชาย ใจดี' });
  });

  it('staff create "awaiting price" products and can never send prices', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const cpu = await categoryId(owner, 'cpu');

    const withPrice = await staff.post(
      '/api/products',
      baseProduct(cpu, { pricing: { priceSatang: 100 } }),
    );
    expect(withPrice.statusCode).toBe(403);
    expect(withPrice.json().error.code).toBe('FORBIDDEN_FIELDS');

    const created = await createProduct(staff, baseProduct(cpu));
    expect(created.priceSatang).toBeNull();
    expect(findForbiddenKeys(created)).toEqual([]);
    // Money fields outside `pricing` are unknown keys and are dropped.
    const sneaky = await createProduct(
      staff,
      baseProduct(cpu, { name: 'x', priceSatang: 1, costSatang: 1 }),
    );
    const row = app.database.db.select().from(products).where(eq(products.id, sneaky.id)).get()!;
    expect(row).toMatchObject({ priceSatang: null, costSatang: 0 });
  });

  it('validates specs against the category kind', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await categoryId(owner, 'cpu');
    const res = await owner.post('/api/products', baseProduct(cpu, { specs: { socket: 'AM3' } }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.issues[0].path).toBe('specs.socket');
  });

  it('rejects duplicate SKUs and barcodes, and corrects Thai-layout barcodes', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await categoryId(owner, 'cpu');
    // "8850999220000" scanned while Windows uses the Thai keyboard layout.
    const created = await createProduct(
      owner,
      baseProduct(cpu, { sku: 'r5-7600', barcode: 'คคถจตตต//จจจจ' }),
    );
    expect(created).toMatchObject({ sku: 'R5-7600', barcode: '8850999220000' });

    const sameSku = await owner.post('/api/products', baseProduct(cpu, { sku: 'R5-7600' }));
    expect(sameSku.json().error.code).toBe('SKU_TAKEN');
    const sameBarcode = await owner.post(
      '/api/products',
      baseProduct(cpu, { barcode: '8850999220000' }),
    );
    expect(sameBarcode.statusCode).toBe(409);
    expect(sameBarcode.json().error.code).toBe('BARCODE_TAKEN');
  });

  it('refuses serial tracking without stock tracking', async () => {
    const { owner } = await setUpShop(app);
    const service = await categoryId(owner, 'service');
    const res = await owner.post(
      '/api/products',
      baseProduct(service, { trackStock: false, serialRequired: true, specs: {} }),
    );
    expect(res.json().error.code).toBe('SERIAL_WITHOUT_STOCK');
  });
});

describe('editing products', () => {
  it('staff may edit only description and specs; money keys are rejected outright', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const cpu = await categoryId(owner, 'cpu');
    const product = await createProduct(
      owner,
      baseProduct(cpu, { pricing: { priceSatang: 500_000 } }),
    );
    const url = `/api/products/${product.id}`;

    const ok = await patch(staff, url, { description: 'ซีพียู 6 คอร์', specs: { socket: 'AM5' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ description: 'ซีพียู 6 คอร์', specs: { socket: 'AM5' } });

    const core = await patch(staff, url, { name: 'ชื่อใหม่' });
    expect(core.statusCode).toBe(403);
    expect(core.json().error.code).toBe('FORBIDDEN_FIELDS');

    for (const body of [{ priceSatang: 1 }, { regularPriceSatang: 1 }, { costSatang: 1 }]) {
      // Not part of any update schema (strict) → validation error for everyone.
      expect((await patch(staff, url, body)).statusCode).toBe(400);
      expect((await patch(owner, url, body)).statusCode).toBe(400);
    }
    const row = app.database.db.select().from(products).where(eq(products.id, product.id)).get()!;
    expect(row).toMatchObject({ name: 'AMD Ryzen 5 7600', priceSatang: 500_000, costSatang: 0 });
  });

  it('owner edits core fields; moving category re-validates specs', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await categoryId(owner, 'cpu');
    const other = await categoryId(owner, 'other');
    const product = await createProduct(owner, baseProduct(cpu));

    const moved = await patch(owner, `/api/products/${product.id}`, {
      categoryId: other,
      name: 'ของแถม',
    });
    expect(moved.statusCode).toBe(200);
    // Keys that don't belong to the new kind are dropped.
    expect(moved.json()).toMatchObject({ categoryKind: 'other', name: 'ของแถม', specs: {} });

    const audit = app.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.update'))
      .all();
    expect(audit).toHaveLength(1);
  });

  it('locks stock settings while there is stock on hand', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await categoryId(owner, 'cpu');
    const product = await createProduct(owner, baseProduct(cpu));
    setOnHand(product.id, 3);
    const res = await patch(owner, `/api/products/${product.id}`, { serialRequired: false });
    expect(res.json().error.code).toBe('STOCK_SETTINGS_LOCKED');
  });

  it('staff can set and reorder images; unknown files are rejected', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const cpu = await categoryId(owner, 'cpu');
    const product = await createProduct(owner, baseProduct(cpu));
    const a = await uploadImage(staff, 'a');
    const b = await uploadImage(staff, 'b');
    const url = `/api/products/${product.id}/images`;

    const res = await staff.request('PUT', url, { fileIds: [b.id, a.id] });
    expect(res.statusCode).toBe(200);
    expect(res.json().images.map((i: { fileId: number }) => i.fileId)).toEqual([b.id, a.id]);
    expect(res.json().thumbUrl).toBe(b.thumbUrl);

    const list = (await staff.get('/api/products')).json().items;
    expect(list[0].thumbUrl).toBe(b.thumbUrl);

    expect((await staff.request('PUT', url, { fileIds: [9999] })).json().error.code).toBe(
      'FILE_NOT_FOUND',
    );
  });
});

describe('pricing (owner only)', () => {
  it('lowering a price keeps the old one as the regular price; end discount restores it', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const cpu = await categoryId(owner, 'cpu');
    const product = await createProduct(owner, baseProduct(cpu));
    const url = `/api/products/${product.id}/pricing`;

    expect((await staff.request('PUT', url, { priceSatang: 100 })).statusCode).toBe(403);
    expect((await staff.post(`${url}/end-discount`)).statusCode).toBe(403);

    // Awaiting price → first price: no regular price.
    let res = await owner.request('PUT', url, { priceSatang: 10_000 });
    expect(res.json()).toMatchObject({ priceSatang: 10_000, regularPriceSatang: null });

    // 100 → 80: shows "-20%".
    res = await owner.request('PUT', url, { priceSatang: 8_000 });
    expect(res.json()).toMatchObject({ priceSatang: 8_000, regularPriceSatang: 10_000 });

    // Staff see the discounted price and the regular price, but not the cost.
    const seen = (await staff.get(`/api/products/${product.id}`)).json();
    expect(seen).toMatchObject({ priceSatang: 8_000, regularPriceSatang: 10_000 });
    expect(findForbiddenKeys(seen)).toEqual([]);

    res = await owner.post(`${url}/end-discount`);
    expect(res.json()).toMatchObject({ priceSatang: 10_000, regularPriceSatang: null });

    const history = (await staff.get(`/api/products/${product.id}/price-history`)).json().items;
    expect(history.map((h: { priceSatang: number }) => h.priceSatang)).toEqual([
      10_000, 8_000, 10_000,
    ]);
  });

  it('overrides cost without adding a price history row, and audits it', async () => {
    const { owner } = await setUpShop(app);
    const cpu = await categoryId(owner, 'cpu');
    const product = await createProduct(
      owner,
      baseProduct(cpu, { pricing: { priceSatang: 10_000 } }),
    );
    const res = await owner.request('PUT', `/api/products/${product.id}/pricing`, {
      priceSatang: 10_000,
      costSatang: 7_500,
    });
    expect(res.json().costSatang).toBe(7_500);
    const history = (await owner.get(`/api/products/${product.id}/price-history`)).json().items;
    expect(history).toHaveLength(1);
    const audit = app.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.pricing_change'))
      .get()!;
    expect(audit.detail).toMatchObject({ to: { cost: 7_500 } });
  });
});

describe('listing and lookup', () => {
  async function seed(owner: TestClient) {
    const cpu = await categoryId(owner, 'cpu');
    const ram = await categoryId(owner, 'ram');
    const a = await createProduct(
      owner,
      baseProduct(cpu, {
        name: 'Ryzen 5 7600',
        barcode: '8850999220000',
        pricing: { priceSatang: 699_000 },
      }),
    );
    const b = await createProduct(
      owner,
      baseProduct(ram, {
        name: 'Kingston Fury 16GB',
        condition: 'used',
        serialRequired: false,
        specs: {},
        pricing: { priceSatang: 150_000 },
      }),
    );
    const c = await createProduct(owner, baseProduct(ram, { name: 'Corsair 32GB', specs: {} }));
    await owner.request('PUT', `/api/products/${b.id}/pricing`, { priceSatang: 120_000 });
    setOnHand(a.id, 5);
    setOnHand(b.id, 1);
    return { cpu, ram, a, b, c };
  }
  const ids = async (client: TestClient, query: string) =>
    ((await client.get(`/api/products${query}`)).json().items as { id: number }[]).map((p) => p.id);

  it('filters by text, category, condition, discount, stock, and status', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const { ram, a, b, c } = await seed(owner);

    expect(await ids(staff, '?q=ryzen')).toEqual([a.id]);
    expect(await ids(staff, '?q=RAM-')).toEqual([c.id, b.id]); // sorted by name
    expect(await ids(staff, `?categoryId=${ram}`)).toEqual([c.id, b.id]);
    expect(await ids(staff, '?condition=used')).toEqual([b.id]);
    expect(await ids(staff, '?discounted=true')).toEqual([b.id]);
    expect(await ids(staff, '?stock=in')).toEqual([b.id, a.id]);
    expect(await ids(staff, '?stock=out')).toEqual([c.id]);
    expect(await ids(staff, '?stock=low')).toEqual([b.id]); // 1 ≤ minStock 2
    expect(await ids(staff, '?status=awaitingPrice')).toEqual([c.id]);
    expect(await ids(staff, '?sort=price')).toEqual([b.id, a.id, c.id]); // no price last

    const page = (await staff.get('/api/products?pageSize=2&page=2')).json();
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
  });

  it('treats LIKE wildcards in the search text literally', async () => {
    const { owner } = await setUpShop(app);
    await seed(owner);
    expect(await ids(owner, '?q=%25')).toEqual([]);
    expect(await ids(owner, '?q=_')).toEqual([]);
  });

  it('never sends cost to staff in lists or lookups', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    await seed(owner);
    const list = (await staff.get('/api/products')).json();
    expect(findForbiddenKeys(list)).toEqual([]);
    expect((await owner.get('/api/products')).json().items[0]).toHaveProperty('costSatang');
    const lookup = (await staff.get('/api/products/lookup?code=8850999220000')).json();
    expect(findForbiddenKeys(lookup)).toEqual([]);
  });

  it('looks up exact barcode, SKU, and serial codes, fixing the Thai keyboard layout', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const { a, c } = await seed(owner);
    const lookup = (code: string) =>
      staff.get(`/api/products/lookup?code=${encodeURIComponent(code)}`);

    expect((await lookup('8850999220000')).json()).toMatchObject({
      matchedBy: 'barcode',
      product: { id: a.id },
    });
    expect((await lookup('คคถจตตต//จจจจ')).json()).toMatchObject({
      matchedBy: 'barcode',
      code: '8850999220000',
    });
    expect((await lookup(c.sku.toLowerCase())).json()).toMatchObject({
      matchedBy: 'sku',
      product: { id: c.id },
    });

    const serial = app.database.db
      .insert(serialItems)
      .values({
        productId: a.id,
        serialNo: 'SN123ABC',
        status: 'in_stock',
        unitCostSatang: 0,
        receivedAt: Date.now(),
      })
      .returning()
      .get();
    expect((await lookup('sn123abc')).json()).toMatchObject({
      matchedBy: 'serial',
      serialItemId: serial.id,
      product: { id: a.id },
    });
    expect(await ids(staff, '?q=SN123')).toEqual([a.id]);

    const missing = await lookup('0000000000000');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('PRODUCT_NOT_FOUND');
  });
});

describe('archiving', () => {
  it('owner archives only products without stock; archived products are hidden', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const cpu = await categoryId(owner, 'cpu');
    const product = await createProduct(owner, baseProduct(cpu, { barcode: '1234' }));
    const url = `/api/products/${product.id}`;

    expect((await staff.post(`${url}/archive`)).statusCode).toBe(403);

    setOnHand(product.id, 1);
    expect((await owner.post(`${url}/archive`)).json().error.code).toBe('PRODUCT_HAS_STOCK');
    setOnHand(product.id, 0);

    const archived = await owner.post(`${url}/archive`);
    expect(archived.json().archivedAt).not.toBeNull();
    expect((await owner.get('/api/products')).json().total).toBe(0);
    expect((await owner.get('/api/products?status=archived')).json().total).toBe(1);
    expect((await owner.get('/api/products/lookup?code=1234')).statusCode).toBe(404);

    const restored = await owner.post(`${url}/unarchive`);
    expect(restored.json().archivedAt).toBeNull();
    expect((await owner.get('/api/products')).json().total).toBe(1);
  });
});
