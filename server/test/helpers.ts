import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { SetupInput } from '@pcshop/shared';
import { buildApp } from '../src/app';
import { DatabaseManager } from '../src/db/client';

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../drizzle');

/** A fresh, fully migrated in-memory database. */
export function createTestDatabase(): DatabaseManager {
  return new DatabaseManager(':memory:', MIGRATIONS_FOLDER);
}

/** A Fastify app backed by a fresh in-memory database; closing the app closes the database. */
export async function createTestApp() {
  const database = createTestDatabase();
  const app = await buildApp({ database });
  app.addHook('onClose', async () => database.close());
  return app;
}

/**
 * A tiny HTTP client for tests that behaves like the browser: it keeps the session cookie and sends
 * the CSRF header on every request.
 */
export class TestClient {
  cookie = '';

  constructor(readonly app: FastifyInstance) {}

  async request(method: InjectOptions['method'], url: string, body?: unknown) {
    const res = await this.app.inject({
      method,
      url,
      ...(body !== undefined && { payload: body as InjectOptions['payload'] }),
      headers: { 'x-pcshop': '1', ...(this.cookie && { cookie: this.cookie }) },
    });
    const sid = res.cookies.find((c) => c.name === 'sid');
    if (sid) this.cookie = sid.value ? `sid=${sid.value}` : '';
    return res;
  }

  get(url: string) {
    return this.request('GET', url);
  }

  post(url: string, body?: unknown) {
    return this.request('POST', url, body ?? {});
  }
}

export const OWNER = { name: 'สมชาย ใจดี', username: 'owner', password: 'owner-pass-123' };

export const SETUP_INPUT: SetupInput = {
  owner: OWNER,
  shop: { shopName: 'ร้านคอมทดสอบ', phone: '081-234-5678', promptpayId: '0812345678' },
};

export async function patch(client: TestClient, url: string, body: unknown) {
  return client.request('PATCH', url, body);
}

/** Owner creates a staff account; returns a client logged in as that staff member. */
export async function createStaff(
  owner: TestClient,
  username = 'staff1',
  password = 'staff-pass',
): Promise<{ staff: TestClient; id: number }> {
  const res = await owner.post('/api/users', {
    name: 'พนักงาน ทดสอบ',
    username,
    password,
    role: 'staff',
  });
  if (res.statusCode !== 201) throw new Error(`create staff failed: ${res.body}`);
  const staff = new TestClient(owner.app);
  const login = await staff.post('/api/auth/login', { username, password });
  if (login.statusCode !== 200) throw new Error(`staff login failed: ${login.body}`);
  return { staff, id: res.json().id };
}

/** Runs first-run setup; returns a client logged in as the owner and the recovery code. */
export async function setUpShop(app: FastifyInstance) {
  const owner = new TestClient(app);
  const res = await owner.post('/api/setup', SETUP_INPUT);
  if (res.statusCode !== 200) throw new Error(`setup failed: ${res.body}`);
  return { owner, recoveryCode: res.json().recoveryCode as string };
}
