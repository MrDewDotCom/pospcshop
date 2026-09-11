import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { auditLogs, products } from '../src/db/schema';
import { createStaff, createTestApp, patch, setUpShop, type TestClient } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

async function createTag(client: TestClient, name: string, color = 'blue') {
  const res = await client.post('/api/tags', { name, color });
  if (res.statusCode !== 201) throw new Error(`create tag failed: ${res.body}`);
  return res.json() as { id: number; name: string; color: string; productCount: number };
}

async function createProduct(
  client: TestClient,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const categories = (await client.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  const res = await client.post('/api/products', {
    sku: '',
    barcode: '',
    name,
    brand: '',
    categoryId: categories.find((c) => c.kind === 'other')!.id,
    condition: 'new',
    warrantyType: 'shop',
    warrantyMonths: 6,
    supplierWarrantyMonths: 0,
    trackStock: true,
    serialRequired: false,
    minStock: 1,
    notes: '',
    description: '',
    specs: {},
    ...extra,
  });
  if (res.statusCode !== 201) throw new Error(`create product failed: ${res.body}`);
  return res.json() as { id: number };
}

const setTags = (client: TestClient, productId: number, tagIds: number[]) =>
  client.request('PUT', `/api/products/${productId}/tags`, { tagIds });

describe('custom tags', () => {
  it('owner manages tags; staff can read them but not change them', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);

    const openBox = await createTag(owner, 'Open box', 'amber');
    expect(openBox).toMatchObject({ name: 'Open box', color: 'amber', productCount: 0 });
    await createTag(owner, 'กล่องไม่สวย', 'gray');

    expect((await owner.post('/api/tags', { name: 'open BOX', color: 'red' })).statusCode).toBe(
      409,
    );
    expect((await owner.post('/api/tags', { name: 'x', color: 'neon' })).statusCode).toBe(400);

    const renamed = await patch(owner, `/api/tags/${openBox.id}`, { name: 'แกะกล่อง' });
    expect(renamed.json()).toMatchObject({ name: 'แกะกล่อง', color: 'amber' });

    expect(
      (await staff.get('/api/tags')).json().items.map((t: { name: string }) => t.name),
    ).toEqual(['แกะกล่อง', 'กล่องไม่สวย']);
    expect((await staff.post('/api/tags', { name: 'x', color: 'red' })).statusCode).toBe(403);
    expect((await patch(staff, `/api/tags/${openBox.id}`, { name: 'x' })).statusCode).toBe(403);
    expect((await staff.post(`/api/tags/${openBox.id}/archive`)).statusCode).toBe(403);
  });

  it('reorders tags', async () => {
    const { owner } = await setUpShop(app);
    const a = await createTag(owner, 'A');
    const b = await createTag(owner, 'B');
    const c = await createTag(owner, 'C');
    const res = await owner.request('PUT', '/api/tags/order', { ids: [c.id, a.id] });
    expect(res.json().items.map((t: { id: number }) => t.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe('tags on products', () => {
  it('owner assigns tags; products show them in tag order with counts; audited', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const openBox = await createTag(owner, 'Open box', 'amber');
    const recommended = await createTag(owner, 'สินค้าแนะนำ', 'green');
    const product = await createProduct(owner, 'เมาส์');

    expect((await setTags(staff, product.id, [openBox.id])).statusCode).toBe(403);

    const res = await setTags(owner, product.id, [recommended.id, openBox.id, openBox.id]);
    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual([
      { id: openBox.id, name: 'Open box', color: 'amber' },
      { id: recommended.id, name: 'สินค้าแนะนำ', color: 'green' },
    ]);

    const seen = (await staff.get(`/api/products/${product.id}`)).json();
    expect(seen.tags).toHaveLength(2);
    const listed = (await staff.get('/api/products')).json().items[0];
    expect(listed.tags.map((t: { id: number }) => t.id)).toEqual([openBox.id, recommended.id]);
    expect((await owner.get('/api/tags')).json().items[0].productCount).toBe(1);

    // Saving the same set again changes nothing and isn't audited twice.
    await setTags(owner, product.id, [openBox.id, recommended.id]);
    const audits = app.database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'product.tags_change'))
      .all();
    expect(audits).toHaveLength(1);

    expect((await setTags(owner, product.id, [9999])).json().error.code).toBe('TAG_NOT_FOUND');
    expect((await setTags(owner, product.id, [])).json().tags).toEqual([]);
  });

  it('filters the product list by tag', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const used = await createTag(owner, 'ไม่มีกล่อง');
    const a = await createProduct(owner, 'A');
    await createProduct(owner, 'B');
    await setTags(owner, a.id, [used.id]);

    const items = (await staff.get(`/api/products?tagId=${used.id}`)).json().items;
    expect(items.map((p: { id: number }) => p.id)).toEqual([a.id]);
  });

  it('archiving a tag hides it but keeps assignments; archived tags cannot be newly assigned', async () => {
    const { owner } = await setUpShop(app);
    const tag = await createTag(owner, 'ของโชว์');
    const other = await createTag(owner, 'อื่นๆ');
    const a = await createProduct(owner, 'A');
    const b = await createProduct(owner, 'B');
    await setTags(owner, a.id, [tag.id]);

    await owner.post(`/api/tags/${tag.id}/archive`);
    expect((await owner.get('/api/tags')).json().items.map((t: { id: number }) => t.id)).toEqual([
      other.id,
    ]);
    expect((await owner.get('/api/tags?includeArchived=true')).json().items).toHaveLength(2);
    expect((await owner.get(`/api/products/${a.id}`)).json().tags).toEqual([]);

    expect((await setTags(owner, b.id, [tag.id])).json().error.code).toBe('TAG_ARCHIVED');
    // Editing A's visible tags keeps the hidden one.
    await setTags(owner, a.id, [other.id]);

    await owner.post(`/api/tags/${tag.id}/unarchive`);
    const tagsOfA = (await owner.get(`/api/products/${a.id}`)).json().tags;
    expect(tagsOfA.map((t: { id: number }) => t.id)).toEqual([tag.id, other.id]);
  });
});

describe('automatic tags', () => {
  it('are derived on every product response', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const product = await createProduct(owner, 'คีย์บอร์ด', { condition: 'used' });

    const labels = async () =>
      ((await staff.get(`/api/products/${product.id}`)).json().autoTags as { label: string }[]).map(
        (t) => t.label,
      );
    expect(await labels()).toEqual(['รอตั้งราคา', 'มือสอง', 'ประกันร้าน 6 เดือน', 'หมด']);

    await owner.request('PUT', `/api/products/${product.id}/pricing`, { priceSatang: 100_00 });
    await owner.request('PUT', `/api/products/${product.id}/pricing`, { priceSatang: 79_00 });
    app.database.db.update(products).set({ onHand: 1 }).where(eq(products.id, product.id)).run();
    expect(await labels()).toEqual(['-21%', 'มือสอง', 'ประกันร้าน 6 เดือน', 'ใกล้หมด']);

    const listed = (await staff.get('/api/products')).json().items[0];
    expect(listed.autoTags).toHaveLength(4);
  });
});
