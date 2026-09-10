import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { products } from '../src/db/schema';
import { createStaff, createTestApp, patch, setUpShop, type TestClient } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const list = async (client: TestClient, query = '') =>
  (await client.get(`/api/categories${query}`)).json().items as {
    id: number;
    name: string;
    kind: string;
    isSystem: boolean;
    productCount: number;
  }[];

describe('categories', () => {
  it('starts with one system category per kind, readable by staff', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    const items = await list(staff);
    expect(items).toHaveLength(12);
    expect(items[0]).toMatchObject({ kind: 'cpu', isSystem: true, productCount: 0 });
  });

  it('lets only the owner create categories, with unique names', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    expect(
      (await staff.post('/api/categories', { name: 'โน้ตบุ๊ก', kind: 'other' })).statusCode,
    ).toBe(403);

    const created = await owner.post('/api/categories', { name: 'โน้ตบุ๊ก', kind: 'other' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'โน้ตบุ๊ก', isSystem: false });
    // Appended at the end.
    expect((await list(owner)).at(-1)!.name).toBe('โน้ตบุ๊ก');

    const duplicate = await owner.post('/api/categories', { name: 'โน้ตบุ๊ก', kind: 'other' });
    expect(duplicate.json().error.code).toBe('CATEGORY_NAME_TAKEN');
  });

  it('protects system categories: rename yes, change kind or archive no', async () => {
    const { owner } = await setUpShop(app);
    const cpu = (await list(owner))[0]!;
    expect((await patch(owner, `/api/categories/${cpu.id}`, { name: 'CPU' })).json().name).toBe(
      'CPU',
    );
    expect(
      (await patch(owner, `/api/categories/${cpu.id}`, { kind: 'gpu' })).json().error.code,
    ).toBe('SYSTEM_CATEGORY_KIND');
    expect((await owner.post(`/api/categories/${cpu.id}/archive`)).json().error.code).toBe(
      'SYSTEM_CATEGORY',
    );
  });

  it('archives only empty custom categories, and can restore them', async () => {
    const { owner } = await setUpShop(app);
    const custom = (
      await owner.post('/api/categories', { name: 'อุปกรณ์เกมมิ่ง', kind: 'accessory' })
    ).json();

    app.database.db
      .insert(products)
      .values({ sku: 'X1', name: 'จอยเกม', categoryId: custom.id })
      .run();
    expect((await list(owner)).find((c) => c.id === custom.id)!.productCount).toBe(1);
    expect((await owner.post(`/api/categories/${custom.id}/archive`)).json().error.code).toBe(
      'CATEGORY_IN_USE',
    );

    app.database.db.update(products).set({ archivedAt: Date.now() }).run();
    expect((await owner.post(`/api/categories/${custom.id}/archive`)).statusCode).toBe(200);
    expect((await list(owner)).some((c) => c.id === custom.id)).toBe(false);
    expect((await list(owner, '?includeArchived=true')).some((c) => c.id === custom.id)).toBe(true);

    await owner.post(`/api/categories/${custom.id}/unarchive`);
    expect((await list(owner)).some((c) => c.id === custom.id)).toBe(true);
  });

  it('reorders categories', async () => {
    const { owner } = await setUpShop(app);
    const [first, second] = await list(owner);
    const res = await owner.request('PUT', '/api/categories/order', {
      ids: [second!.id, first!.id],
    });
    expect(res.statusCode).toBe(200);
    const after = await list(owner);
    expect(after.slice(0, 2).map((c) => c.id)).toEqual([second!.id, first!.id]);
    expect(after).toHaveLength(12);
  });
});
