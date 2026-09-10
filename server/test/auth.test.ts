import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { categories, shopSettings, users } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';
import { OWNER, SETUP_INPUT, TestClient, createTestApp, setUpShop } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('first-run setup', () => {
  it('reports that setup is needed until an owner exists', async () => {
    const client = new TestClient(app);
    expect((await client.get('/api/setup/status')).json()).toEqual({
      needsSetup: true,
      shopName: null,
    });
    await setUpShop(app);
    expect((await client.get('/api/setup/status')).json()).toEqual({
      needsSetup: false,
      shopName: 'ร้านคอมทดสอบ',
    });
  });

  it('creates the owner, shop settings, default categories, and logs the owner in', async () => {
    const { owner, recoveryCode } = await setUpShop(app);
    expect(recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);

    const me = await owner.get('/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ username: 'owner', role: 'owner' });
    expect(me.json().permissions).toContain('cost.view');

    const db = app.database.db;
    const settings = db.select().from(shopSettings).get()!;
    expect(settings.shopName).toBe('ร้านคอมทดสอบ');
    expect(settings.promptpayId).toBe('0812345678'); // dashes removed
    expect(db.select().from(categories).all()).toHaveLength(12);
  });

  it('can only run once', async () => {
    await setUpShop(app);
    const res = await new TestClient(app).post('/api/setup', SETUP_INPUT);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_SET_UP');
  });

  it('rejects invalid input with Thai validation messages', async () => {
    const res = await new TestClient(app).post('/api/setup', {
      owner: { name: 'A', username: 'x', password: 'short' },
      shop: { shopName: '', promptpayId: '123' },
    });
    expect(res.statusCode).toBe(400);
    const { code, details } = res.json().error;
    expect(code).toBe('VALIDATION_ERROR');
    const paths = details.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'owner.username',
        'owner.password',
        'shop.shopName',
        'shop.promptpayId',
      ]),
    );
  });
});

describe('request guards', () => {
  it('requires a session for API routes', async () => {
    await setUpShop(app);
    const res = await new TestClient(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: OWNER });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('still answers unknown API routes with 404', async () => {
    expect((await new TestClient(app).get('/api/nope')).statusCode).toBe(404);
  });
});

describe('login and logout', () => {
  it('logs in with the right password and out again', async () => {
    await setUpShop(app);
    const client = new TestClient(app);

    const bad = await client.post('/api/auth/login', { username: 'owner', password: 'wrong' });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    });

    // Username is case-insensitive.
    const ok = await client.post('/api/auth/login', {
      username: 'OWNER',
      password: OWNER.password,
    });
    expect(ok.statusCode).toBe(200);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200);

    await client.post('/api/auth/logout');
    expect(client.cookie).toBe('');
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('gives the same error for unknown users', async () => {
    await setUpShop(app);
    const res = await new TestClient(app).post('/api/auth/login', {
      username: 'ghost',
      password: 'x',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks out after 5 failed attempts, even with the right password', async () => {
    await setUpShop(app);
    const client = new TestClient(app);
    for (let i = 0; i < 5; i++) {
      await client.post('/api/auth/login', { username: 'owner', password: 'wrong' });
    }
    const res = await client.post('/api/auth/login', {
      username: 'owner',
      password: OWNER.password,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('refuses deactivated users and ends their sessions', async () => {
    await setUpShop(app);
    const db = app.database.db;
    db.insert(users)
      .values({
        name: 'พนักงาน',
        username: 'staff1',
        passwordHash: await hashPassword('staff-pw'),
        role: 'staff',
      })
      .run();
    const staff = new TestClient(app);
    expect(
      (await staff.post('/api/auth/login', { username: 'staff1', password: 'staff-pw' }))
        .statusCode,
    ).toBe(200);

    db.update(users).set({ isActive: false }).where(eq(users.username, 'staff1')).run();
    expect((await staff.get('/api/auth/me')).statusCode).toBe(401);
    const retry = await staff.post('/api/auth/login', { username: 'staff1', password: 'staff-pw' });
    expect(retry.statusCode).toBe(401);
  });
});

describe('change password', () => {
  it('checks the current password and signs out other sessions', async () => {
    const { owner } = await setUpShop(app);
    const otherDevice = new TestClient(app);
    await otherDevice.post('/api/auth/login', { username: 'owner', password: OWNER.password });

    const wrong = await owner.post('/api/auth/change-password', {
      currentPassword: 'nope',
      newPassword: 'new-owner-pass',
    });
    expect(wrong.json().error.code).toBe('WRONG_PASSWORD');

    const tooShort = await owner.post('/api/auth/change-password', {
      currentPassword: OWNER.password,
      newPassword: 'short7', // 6+ passes the schema, but owners need 8
    });
    expect(tooShort.json().error.code).toBe('PASSWORD_TOO_SHORT');

    const ok = await owner.post('/api/auth/change-password', {
      currentPassword: OWNER.password,
      newPassword: 'new-owner-pass',
    });
    expect(ok.statusCode).toBe(200);
    expect((await owner.get('/api/auth/me')).statusCode).toBe(200); // this session stays
    expect((await otherDevice.get('/api/auth/me')).statusCode).toBe(401); // others are signed out

    const relogin = await new TestClient(app).post('/api/auth/login', {
      username: 'owner',
      password: 'new-owner-pass',
    });
    expect(relogin.statusCode).toBe(200);
  });
});

describe('owner recovery code', () => {
  it('resets the password once and issues a new code', async () => {
    const { owner, recoveryCode } = await setUpShop(app);
    const client = new TestClient(app);

    const wrong = await client.post('/api/auth/recover', {
      username: 'owner',
      recoveryCode: 'AAAAA-AAAAA-AAAAA-AAAAA',
      newPassword: 'recovered-pass',
    });
    expect(wrong.json().error.code).toBe('INVALID_RECOVERY');

    // Lowercase and missing dashes are accepted.
    const ok = await client.post('/api/auth/recover', {
      username: 'owner',
      recoveryCode: recoveryCode.toLowerCase().replaceAll('-', ''),
      newPassword: 'recovered-pass',
    });
    expect(ok.statusCode).toBe(200);
    const nextCode = ok.json().recoveryCode;
    expect(nextCode).not.toBe(recoveryCode);

    expect((await owner.get('/api/auth/me')).statusCode).toBe(401); // old sessions ended
    const login = await client.post('/api/auth/login', {
      username: 'owner',
      password: 'recovered-pass',
    });
    expect(login.statusCode).toBe(200);

    const reuse = await new TestClient(app).post('/api/auth/recover', {
      username: 'owner',
      recoveryCode,
      newPassword: 'another-pass',
    });
    expect(reuse.json().error.code).toBe('INVALID_RECOVERY'); // the old code no longer works
  });
});
