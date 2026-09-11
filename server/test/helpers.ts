import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { SetupInput } from '@pcshop/shared';
import { buildApp } from '../src/app';
import { dataPaths, ensureDataDirs } from '../src/config';
import { DatabaseManager } from '../src/db/client';

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../drizzle');

/** A fresh, fully migrated in-memory database. */
export function createTestDatabase(): DatabaseManager {
  return new DatabaseManager(':memory:', MIGRATIONS_FOLDER);
}

/**
 * A Fastify app backed by a fresh in-memory database and a temporary data directory (for uploads and
 * backups). Closing the app closes the database and deletes the directory.
 */
export async function createTestApp() {
  const database = createTestDatabase();
  const paths = dataPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-test-')));
  ensureDataDirs(paths);
  const app = await buildApp({ database, paths });
  app.addHook('onClose', async () => {
    database.close();
    fs.rmSync(paths.root, { recursive: true, force: true });
  });
  return app;
}

/**
 * Like createTestApp, but the database is a real file in the temporary data directory (backup and
 * restore need one). `reuseRoot` reopens an existing data directory, like restarting the server.
 */
export async function createFileTestApp(reuseRoot?: string) {
  const paths = dataPaths(reuseRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-test-')));
  ensureDataDirs(paths);
  const database = new DatabaseManager(paths.dbFile, MIGRATIONS_FOLDER);
  const app = await buildApp({ database, paths });
  app.addHook('onClose', async () => database.close());
  return { app, paths, cleanup: () => fs.rmSync(paths.root, { recursive: true, force: true }) };
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

  /** Sends multipart/form-data (file parts need a filename). */
  async upload(url: string, parts: MultipartPart[]) {
    const { payload, contentType } = buildMultipart(parts);
    const res = await this.app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        'content-type': contentType,
        'x-pcshop': '1',
        ...(this.cookie && { cookie: this.cookie }),
      },
    });
    return res;
  }

  post(url: string, body?: unknown) {
    return this.request('POST', url, body ?? {});
  }
}

export interface MultipartPart {
  name: string;
  data: Buffer | string;
  filename?: string;
  contentType?: string;
}

export function buildMultipart(parts: MultipartPart[]) {
  const boundary = `----pcshop-test-${Date.now()}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = `form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}`;
    const type = part.filename
      ? `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n`
      : '';
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\n${type}\r\n`));
    chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Tiny byte strings that pass the server's image type detection (content is irrelevant). */
export const FAKE_JPEG = (seed = 'a') =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`jpeg-body-${seed}-padding`)]);
export const FAKE_PNG = (seed = 'a') =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`png-body-${seed}`),
  ]);

/** Uploads a fake JPEG as `client`; returns the stored file. */
export async function uploadImage(client: TestClient, seed = 'a') {
  const res = await client.upload('/api/files', [
    { name: 'image', filename: 'photo.jpg', contentType: 'image/jpeg', data: FAKE_JPEG(seed) },
  ]);
  if (res.statusCode !== 201) throw new Error(`upload failed: ${res.body}`);
  return res.json() as { id: number; url: string; thumbUrl: string };
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
