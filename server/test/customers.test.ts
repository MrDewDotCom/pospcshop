import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createStaff, createTestApp, patch, setUpShop } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('customers', () => {
  it('staff create and edit customers; only the owner archives', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);

    const created = await staff.post('/api/customers', {
      name: 'สมหญิง รักดี',
      phone: '081-234-5678',
    });
    expect(created.statusCode).toBe(201);
    const customer = created.json();
    expect(customer).toMatchObject({
      name: 'สมหญิง รักดี',
      phone: '081-234-5678',
      lineId: '',
      archivedAt: null,
      saleCount: 0,
      lastSaleAt: null,
    });

    // A partial update keeps the fields it doesn't mention.
    const edited = await patch(staff, `/api/customers/${customer.id}`, { lineId: '@somying' });
    expect(edited.json()).toMatchObject({ lineId: '@somying', phone: '081-234-5678' });

    expect((await staff.post(`/api/customers/${customer.id}/archive`)).statusCode).toBe(403);
    expect((await owner.post(`/api/customers/${customer.id}/archive`)).statusCode).toBe(200);
    expect((await staff.get('/api/customers')).json().total).toBe(0);
    expect((await staff.get('/api/customers?includeArchived=true')).json().total).toBe(1);
    expect(
      (await owner.post(`/api/customers/${customer.id}/unarchive`)).json().archivedAt,
    ).toBeNull();

    const log = (await owner.get('/api/audit-logs'))
      .json()
      .items.map((e: { action: string }) => e.action);
    expect(log).toEqual(
      expect.arrayContaining(['customer.create', 'customer.update', 'customer.archive']),
    );
  });

  it('requires a name and rejects unknown ids', async () => {
    const { owner } = await setUpShop(app);
    expect((await owner.post('/api/customers', { name: '  ' })).statusCode).toBe(400);
    expect((await owner.get('/api/customers/999')).statusCode).toBe(404);
    expect((await patch(owner, '/api/customers/999', { name: 'x' })).statusCode).toBe(404);
  });

  it('searches by name and by phone in any format', async () => {
    const { owner } = await setUpShop(app);
    await owner.post('/api/customers', { name: 'สมชาย', phone: '081-234-5678' });
    await owner.post('/api/customers', {
      name: 'Somsri',
      phone: '02 111 2222',
      lineId: 'somsri.pc',
    });
    const names = async (q: string) =>
      (await owner.get(`/api/customers?q=${encodeURIComponent(q)}`))
        .json()
        .items.map((c: { name: string }) => c.name);
    expect(await names('สมชาย')).toEqual(['สมชาย']);
    expect(await names('somsri')).toEqual(['Somsri']);
    expect(await names('0812345678')).toEqual(['สมชาย']);
    expect(await names('+66 81 234')).toEqual([]); // partial +66 numbers aren't converted
    expect(await names('+66 81 234 5678')).toEqual(['สมชาย']);
    expect(await names('021112222')).toEqual(['Somsri']);
    expect(await names('somsri.pc')).toEqual(['Somsri']);
  });

  it('warns about customers with the same phone number without blocking', async () => {
    const { owner } = await setUpShop(app);
    const first = (
      await owner.post('/api/customers', { name: 'พ่อ', phone: '081-234-5678' })
    ).json();
    const second = await owner.post('/api/customers', { name: 'ลูก', phone: '0812345678' });
    expect(second.statusCode).toBe(201);

    const matches = (await owner.get('/api/customers/phone-matches?phone=%2B66812345678')).json();
    expect(matches.items.map((m: { name: string }) => m.name)).toEqual(['พ่อ', 'ลูก']);

    const excluding = (
      await owner.get(`/api/customers/phone-matches?phone=0812345678&excludeId=${first.id}`)
    ).json();
    expect(excluding.items.map((m: { name: string }) => m.name)).toEqual(['ลูก']);

    // Too short to be a phone number: no warning.
    expect((await owner.get('/api/customers/phone-matches?phone=081')).json().items).toEqual([]);
  });

  it('returns an empty history for a new customer', async () => {
    const { owner } = await setUpShop(app);
    const customer = (await owner.post('/api/customers', { name: 'ใหม่' })).json();
    expect((await owner.get(`/api/customers/${customer.id}/history`)).json()).toEqual({
      sales: [],
      returns: [],
    });
    expect((await owner.get('/api/customers/999/history')).statusCode).toBe(404);
  });
});
