import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { detectImageType } from '../src/lib/files';
import {
  FAKE_JPEG,
  FAKE_PNG,
  TestClient,
  createStaff,
  createTestApp,
  patch,
  setUpShop,
  uploadImage,
} from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('image type detection', () => {
  it('recognizes JPEG, PNG, and WebP by their first bytes', () => {
    expect(detectImageType(FAKE_JPEG())?.mime).toBe('image/jpeg');
    expect(detectImageType(FAKE_PNG())?.mime).toBe('image/png');
    expect(detectImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '))?.mime).toBe('image/webp');
    expect(detectImageType(Buffer.from('<?php echo "not an image"; ?>'))).toBeNull();
  });
});

describe('uploads', () => {
  it('stores an image and its thumbnail by content hash', async () => {
    const { owner } = await setUpShop(app);
    const res = await owner.upload('/api/files', [
      { name: 'image', filename: 'a.jpg', contentType: 'image/jpeg', data: FAKE_JPEG() },
      { name: 'thumb', filename: 'a_t.png', contentType: 'image/png', data: FAKE_PNG() },
      { name: 'width', data: '1600' },
      { name: 'height', data: '1200' },
    ]);
    expect(res.statusCode).toBe(201);
    const file = res.json();
    expect(file).toMatchObject({ mime: 'image/jpeg', width: 1600, height: 1200 });
    expect(file.url).toMatch(/^\/uploads\/[0-9a-f]{2}\/[0-9a-f]{64}\.jpg$/);
    expect(file.thumbUrl).toMatch(/_t\.png$/);
    const onDisk = path.join(app.paths!.uploadsDir, file.url.replace('/uploads/', ''));
    expect(fs.readFileSync(onDisk).equals(FAKE_JPEG())).toBe(true);
  });

  it('stores duplicates once', async () => {
    const { owner } = await setUpShop(app);
    const first = await uploadImage(owner, 'same');
    const second = await uploadImage(owner, 'same');
    expect(second.id).toBe(first.id);
    expect((await uploadImage(owner, 'other')).id).not.toBe(first.id);
  });

  it('rejects files that are not images, whatever their name says', async () => {
    const { owner } = await setUpShop(app);
    const res = await owner.upload('/api/files', [
      {
        name: 'image',
        filename: 'evil.jpg',
        contentType: 'image/jpeg',
        data: 'MZ this is not an image',
      },
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_FILE');
  });

  it('rejects files over 5 MB', async () => {
    const { owner } = await setUpShop(app);
    const huge = Buffer.concat([FAKE_JPEG(), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const res = await owner.upload('/api/files', [
      { name: 'image', filename: 'big.jpg', contentType: 'image/jpeg', data: huge },
    ]);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
  });

  it('lets staff upload but not anonymous users', async () => {
    const { owner } = await setUpShop(app);
    const { staff } = await createStaff(owner);
    expect((await uploadImage(staff)).id).toBeGreaterThan(0);
    const anonymous = await new TestClient(app).upload('/api/files', [
      { name: 'image', filename: 'a.jpg', data: FAKE_JPEG() },
    ]);
    expect(anonymous.statusCode).toBe(401);
  });

  it('serves uploaded files only to logged-in users', async () => {
    const { owner } = await setUpShop(app);
    const file = await uploadImage(owner);

    const res = await owner.get(file.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toContain('private');

    expect((await new TestClient(app).get(file.url)).statusCode).toBe(401);
    expect((await owner.get('/uploads/..%2f..%2fshop.db')).statusCode).not.toBe(200);
    expect((await owner.get('/uploads/ab/missing.jpg')).statusCode).toBe(404);
  });

  it('sets the shop logo from an uploaded file', async () => {
    const { owner } = await setUpShop(app);
    const file = await uploadImage(owner);
    const res = await patch(owner, '/api/settings', { logoFileId: file.id });
    expect(res.json()).toMatchObject({ logoFileId: file.id, logoUrl: file.url });
    const cleared = await patch(owner, '/api/settings', { logoFileId: null });
    expect(cleared.json()).toMatchObject({ logoFileId: null, logoUrl: null });
  });
});
