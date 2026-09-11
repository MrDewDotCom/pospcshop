import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createStaff, createTestApp, patch, setUpShop } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('suppliers', () => {
  it('staff create and edit suppliers; only the owner archives', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);

    const created = await staff.post('/api/suppliers', {
      name: 'บริษัท ซินเน็ค',
      phone: '02-123-4567',
      contactName: 'คุณเอ',
    });
    expect(created.statusCode).toBe(201);
    const supplier = created.json();
    expect(supplier).toMatchObject({ name: 'บริษัท ซินเน็ค', lineId: '', archivedAt: null });

    // A partial update keeps the fields it doesn't mention.
    const edited = await patch(staff, `/api/suppliers/${supplier.id}`, { lineId: '@synnex' });
    expect(edited.json()).toMatchObject({
      lineId: '@synnex',
      phone: '02-123-4567',
      contactName: 'คุณเอ',
    });

    expect((await staff.post('/api/suppliers', { name: 'บริษัท ซินเน็ค' })).statusCode).toBe(409);
    expect((await staff.post(`/api/suppliers/${supplier.id}/archive`)).statusCode).toBe(403);

    await owner.post(`/api/suppliers/${supplier.id}/archive`);
    expect((await staff.get('/api/suppliers')).json().total).toBe(0);
    expect((await staff.get('/api/suppliers?includeArchived=true')).json().total).toBe(1);
  });

  it('searches by name, contact, and phone', async () => {
    const { owner } = await setUpShop(app);
    await owner.post('/api/suppliers', { name: 'Ingram Micro', phone: '081-111-1111' });
    await owner.post('/api/suppliers', { name: 'VST ECS', contactName: 'สมศรี' });
    const names = async (q: string) =>
      (await owner.get(`/api/suppliers?q=${encodeURIComponent(q)}`))
        .json()
        .items.map((s: { name: string }) => s.name);
    expect(await names('ingram')).toEqual(['Ingram Micro']);
    expect(await names('สมศรี')).toEqual(['VST ECS']);
    expect(await names('111')).toEqual(['Ingram Micro']);
  });
});
