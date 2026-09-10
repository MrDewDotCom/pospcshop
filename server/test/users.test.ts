import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { users } from '../src/db/schema';
import { updateUser } from '../src/modules/users/service';
import { TestClient, createStaff, createTestApp, patch, setUpShop } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('user management', () => {
  it('is owner-only', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    expect((await staff.get('/api/users')).statusCode).toBe(403);
    expect(
      (
        await staff.post('/api/users', {
          name: 'x',
          username: 'xx1',
          password: 'secret1',
          role: 'staff',
        })
      ).statusCode,
    ).toBe(403);
    expect((await staff.get('/api/audit-logs')).statusCode).toBe(403);
  });

  it('creates users with unique usernames and role-based password lengths', async () => {
    const { owner } = await setUpShop(app);
    await createStaff(owner, 'staff1');

    const duplicate = await owner.post('/api/users', {
      name: 'x',
      username: 'Staff1',
      password: 'secret1',
      role: 'staff',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('USERNAME_TAKEN');

    const weakOwner = await owner.post('/api/users', {
      name: 'x',
      username: 'owner2',
      password: 'secret1',
      role: 'owner',
    });
    expect(weakOwner.json().error.code).toBe('PASSWORD_TOO_SHORT');

    const list = (await owner.get('/api/users')).json().items;
    expect(list.map((u: { username: string }) => u.username)).toEqual(['owner', 'staff1']);
    expect(list[1]).not.toHaveProperty('passwordHash');
  });

  it('deactivating a user signs them out and blocks login', async () => {
    const { owner } = await setUpShop(app);
    const { staff, id } = await createStaff(owner);

    const res = await patch(owner, `/api/users/${id}`, { isActive: false });
    expect(res.json()).toMatchObject({ isActive: false });
    expect((await staff.get('/api/auth/me')).statusCode).toBe(401);
    const login = await new TestClient(app).post('/api/auth/login', {
      username: 'staff1',
      password: 'staff-pass',
    });
    expect(login.statusCode).toBe(401);

    await patch(owner, `/api/users/${id}`, { isActive: true });
    const again = await new TestClient(app).post('/api/auth/login', {
      username: 'staff1',
      password: 'staff-pass',
    });
    expect(again.statusCode).toBe(200);
  });

  it('applies a role change on the very next request', async () => {
    const { owner } = await setUpShop(app);
    const { staff, id } = await createStaff(owner);
    expect((await staff.get('/api/users')).statusCode).toBe(403);
    await patch(owner, `/api/users/${id}`, { role: 'owner' });
    expect((await staff.get('/api/users')).statusCode).toBe(200);
  });

  it('protects the owner from locking themselves out', async () => {
    const { owner } = await setUpShop(app);
    const me = (await owner.get('/api/auth/me')).json().user;
    expect((await patch(owner, `/api/users/${me.id}`, { isActive: false })).json().error.code).toBe(
      'CANNOT_DEACTIVATE_SELF',
    );
    expect((await patch(owner, `/api/users/${me.id}`, { role: 'staff' })).json().error.code).toBe(
      'CANNOT_DEMOTE_SELF',
    );
  });

  it('never leaves the shop without an active owner', async () => {
    await setUpShop(app);
    const ownerRow = app.database.db.select().from(users).get()!;
    // Called by someone other than the owner (e.g. a future admin tool): still refused.
    const actor = { id: 999, name: 'x', username: 'x', role: 'owner' as const };
    expect(() => updateUser(app.database.db, actor, ownerRow.id, { isActive: false })).toThrow(
      /เจ้าของร้าน/,
    );
  });

  it('resets a password, signing the user out everywhere', async () => {
    const { owner } = await setUpShop(app);
    const { staff, id } = await createStaff(owner);

    const res = await owner.post(`/api/users/${id}/reset-password`, { newPassword: 'fresh-pass' });
    expect(res.statusCode).toBe(200);
    expect((await staff.get('/api/auth/me')).statusCode).toBe(401);
    const login = await new TestClient(app).post('/api/auth/login', {
      username: 'staff1',
      password: 'fresh-pass',
    });
    expect(login.statusCode).toBe(200);
  });

  it('returns 404 for unknown users', async () => {
    const { owner } = await setUpShop(app);
    expect((await patch(owner, '/api/users/999', { name: 'x' })).statusCode).toBe(404);
  });
});

describe('audit log', () => {
  it('records who did what, newest first, with filters and paging', async () => {
    const { owner } = await setUpShop(app);
    const { id } = await createStaff(owner);
    await patch(owner, `/api/users/${id}`, { name: 'พนักงาน ใหม่' });

    const page = (await owner.get('/api/audit-logs?pageSize=2')).json();
    expect(page.total).toBe(4); // setup, create, staff login, update
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      action: 'user.update',
      userName: 'สมชาย ใจดี',
      detail: { changes: { name: { from: 'พนักงาน ทดสอบ', to: 'พนักงาน ใหม่' } } },
    });

    const logins = (await owner.get('/api/audit-logs?action=auth.login')).json();
    expect(logins.items.every((i: { action: string }) => i.action === 'auth.login')).toBe(true);
  });
});
