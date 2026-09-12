import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { fromBangkokParts } from '@pcshop/shared';
import type { DataPaths } from '../src/config';
import {
  appSchemaVersion,
  backupBeforeMigrations,
  isBackupDue,
  readBackupState,
} from '../src/services/backup.service';
import {
  MIGRATIONS_FOLDER,
  TestClient,
  createFileTestApp,
  createStaff,
  setUpShop,
  uploadImage,
} from './helpers';

let app: FastifyInstance;
let paths: DataPaths;
let cleanup: () => void;
let owner: TestClient;
beforeEach(async () => {
  ({ app, paths, cleanup } = await createFileTestApp());
  ({ owner } = await setUpShop(app));
});
afterEach(async () => {
  await app.close();
  cleanup();
});

async function newProduct(name: string, priceSatang: number) {
  const categories = (await owner.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  const res = await owner.post('/api/products', {
    sku: '',
    barcode: '',
    name,
    brand: '',
    categoryId: categories.find((c) => c.kind === 'other')!.id,
    condition: 'new',
    warrantyType: 'none',
    warrantyMonths: 0,
    supplierWarrantyMonths: 0,
    trackStock: true,
    serialRequired: false,
    minStock: 0,
    notes: '',
    description: '',
    specs: {},
    pricing: { priceSatang },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { id: number };
}

const backupNow = async () => {
  const res = await owner.post('/api/backups');
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { id: string; reason: string; productCount: number };
};
const overview = async () => (await owner.get('/api/backups')).json();

describe('isBackupDue', () => {
  const at = (day: number, hour: number, minute = 0) =>
    fromBangkokParts(2026, 9, day, hour, minute);

  it('is due once the backup hour has passed since the last success', () => {
    // Backup hour 22:00. Last success yesterday 22:05.
    const last = at(11, 22, 5);
    expect(isBackupDue(at(12, 21, 59), 22, last)).toBe(false);
    expect(isBackupDue(at(12, 22, 0), 22, last)).toBe(true);
    expect(isBackupDue(at(12, 23, 0), 22, at(12, 22, 1))).toBe(false);
  });

  it('catches up at the next start when the PC was off at the backup hour', () => {
    // Last success two days ago; the PC starts at 09:00 before today's slot → yesterday's slot missed.
    expect(isBackupDue(at(12, 9), 22, at(10, 22, 5))).toBe(true);
    expect(isBackupDue(at(12, 9), 22, null)).toBe(true);
  });
});

describe('creating backups', () => {
  it('writes shop.db, uploads, and a manifest; records state; staff are refused', async () => {
    const { staff } = await createStaff(owner);
    await newProduct('A', 100_00);
    const image = await uploadImage(owner);

    const backup = await backupNow();
    expect(backup).toMatchObject({ reason: 'manual', productCount: 1 });
    const folder = path.join(paths.backupsDir, backup.id);
    expect(fs.existsSync(path.join(folder, 'shop.db'))).toBe(true);
    const imagePath = image.url.replace('/uploads/', '');
    expect(fs.existsSync(path.join(folder, 'uploads', imagePath))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'))).toMatchObject({
      ok: true,
      schemaVersion: appSchemaVersion(MIGRATIONS_FOLDER),
    });
    expect(readBackupState(paths)).toMatchObject({ lastBackupId: backup.id, lastError: null });

    // The backup is a real, complete SQLite database.
    const copy = new Database(path.join(folder, 'shop.db'), { readonly: true });
    expect(copy.prepare('select name from products').all()).toEqual([{ name: 'A' }]);
    copy.close();

    // Valid bodies, so the refusal comes from the permission check (not validation).
    for (const [method, url, body] of [
      ['GET', '/api/backups', undefined],
      ['POST', '/api/backups', {}],
      ['PUT', '/api/backups/settings', { directory: null, keepCount: 3, hour: 1 }],
      ['POST', '/api/backups/restore', { backupId: backup.id }],
    ] as const) {
      expect((await staff.request(method, url, body)).statusCode, url).toBe(403);
    }
  });

  it('keeps only the newest N backups and ignores unfinished folders', async () => {
    await owner.request('PUT', '/api/backups/settings', {
      directory: null,
      keepCount: 2,
      hour: 22,
    });
    fs.mkdirSync(path.join(paths.backupsDir, 'pcshop-backup-2020-01-01_000000.partial'));
    const first = await backupNow();
    const second = await backupNow();
    const third = await backupNow();
    const ids = (await overview()).items.map((b: { id: string }) => b.id);
    expect(ids).toEqual([third.id, second.id]);
    expect(ids).not.toContain(first.id);
    expect(fs.readdirSync(paths.backupsDir).some((n) => n.endsWith('.partial'))).toBe(false);
  });

  it('uses a custom folder that must be absolute and writable', async () => {
    const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-usb-'));
    try {
      const relative = await owner.request('PUT', '/api/backups/settings', {
        directory: 'backups',
        keepCount: 5,
        hour: 21,
      });
      expect(relative.json().error.code).toBe('BACKUP_DIR_NOT_ABSOLUTE');

      await owner.request('PUT', '/api/backups/settings', {
        directory: custom,
        keepCount: 5,
        hour: 21,
      });
      const backup = await backupNow();
      expect(fs.existsSync(path.join(custom, backup.id, 'shop.db'))).toBe(true);
      expect(await overview()).toMatchObject({ directory: custom, keepCount: 5, hour: 21 });
    } finally {
      fs.rmSync(custom, { recursive: true, force: true });
    }
  });
});

describe('restoring', () => {
  it('brings back the data and images of the backup, keeps a safety backup, and signs everyone out', async () => {
    const a = await newProduct('A', 100_00);
    const before = await uploadImage(owner, 'before');
    const backup = await backupNow();

    // Change things after the backup.
    await owner.request('PUT', `/api/products/${a.id}/pricing`, { priceSatang: 90_00 });
    await newProduct('B', 200_00);
    const after = await uploadImage(owner, 'after');

    const res = await owner.post('/api/backups/restore', { backupId: backup.id });
    expect(res.statusCode).toBe(200);
    const { safetyBackupId } = res.json();

    // Everyone must log in again.
    expect((await owner.get('/api/auth/me')).statusCode).toBe(401);
    const again = new TestClient(app);
    await again.post('/api/auth/login', { username: 'owner', password: 'owner-pass-123' });

    const items = (await again.get('/api/products')).json().items;
    expect(
      items.map((p: { name: string; priceSatang: number }) => [p.name, p.priceSatang]),
    ).toEqual([['A', 100_00]]);
    const uploadPath = (url: string) => path.join(paths.uploadsDir, url.replace('/uploads/', ''));
    expect(fs.existsSync(uploadPath(before.url))).toBe(true);
    expect(fs.existsSync(uploadPath(after.url))).toBe(false);

    // The safety backup holds the state from just before the restore (B and the new price).
    const list = (await again.get('/api/backups')).json().items as { id: string; reason: string }[];
    expect(list.find((b) => b.id === safetyBackupId)?.reason).toBe('pre_restore');
    const undo = await again.post('/api/backups/restore', { backupId: safetyBackupId });
    expect(undo.statusCode).toBe(200);
    const third = new TestClient(app);
    await third.post('/api/auth/login', { username: 'owner', password: 'owner-pass-123' });
    expect((await third.get('/api/products')).json().total).toBe(2);

    const audit = (await third.get('/api/audit-logs?action=backup.restore')).json().items;
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect((await third.get('/api/stock/integrity')).json().ok).toBe(true);
  });

  it('restores a backup folder from another location (e.g. a USB drive)', async () => {
    await newProduct('A', 100_00);
    const backup = await backupNow();
    const usb = fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-usb-'));
    try {
      fs.cpSync(path.join(paths.backupsDir, backup.id), path.join(usb, backup.id), {
        recursive: true,
      });
      await newProduct('B', 1);
      const res = await owner.post('/api/backups/restore', { path: path.join(usb, backup.id) });
      expect(res.statusCode).toBe(200);
      const client = new TestClient(app);
      await client.post('/api/auth/login', { username: 'owner', password: 'owner-pass-123' });
      expect((await client.get('/api/products')).json().total).toBe(1);
    } finally {
      fs.rmSync(usb, { recursive: true, force: true });
    }
  });

  it('refuses missing, corrupt, foreign, and newer backups without touching the data', async () => {
    await newProduct('A', 100_00);
    const backup = await backupNow();
    const folder = path.join(paths.backupsDir, backup.id);
    const code = async (body: Record<string, unknown>) =>
      (await owner.post('/api/backups/restore', body)).json().error?.code;

    expect(await code({ backupId: 'pcshop-backup-2020-01-01_000000' })).toBe('NOT_FOUND');
    expect(await code({ backupId: '../../etc' })).toBe('VALIDATION_ERROR');
    expect(await code({ path: 'relative/folder' })).toBe('BACKUP_PATH_NOT_FOUND');
    expect(await code({ path: paths.uploadsDir })).toBe('BACKUP_INVALID');

    // Newer schema: the backup has more migrations than this app knows.
    const newer = new Database(path.join(folder, 'shop.db'));
    newer.prepare("insert into __drizzle_migrations (hash, created_at) values ('future', 1)").run();
    newer.close();
    expect(await code({ backupId: backup.id })).toBe('BACKUP_TOO_NEW');

    // Corrupt file.
    fs.writeFileSync(path.join(folder, 'shop.db'), 'not a database');
    expect(await code({ backupId: backup.id })).toBe('BACKUP_INVALID');

    // Still logged in, data untouched, and no safety backup was made for refused restores.
    expect((await owner.get('/api/products')).json().total).toBe(1);
    expect((await overview()).items).toHaveLength(1);
  });

  it('answers 503 to API requests while a restore is swapping the database', async () => {
    app.maintenance.reason = 'restore';
    const res = await owner.get('/api/products');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('MAINTENANCE');
    expect((await owner.get('/api/health')).statusCode).toBe(200);
    app.maintenance.reason = null;
  });
});

describe('backup before migrations', () => {
  it('backs up an existing database only when the app brings new migrations', async () => {
    await newProduct('A', 100_00);
    await app.close(); // like stopping the server before an update

    expect(await backupBeforeMigrations(paths, MIGRATIONS_FOLDER)).toBeNull(); // up to date

    // An "update" with one more migration in its journal.
    const future = fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-migrations-'));
    try {
      const journal = JSON.parse(
        fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
      );
      const next = journal.entries.length;
      journal.entries.push({
        ...journal.entries[0],
        idx: next,
        tag: `${String(next).padStart(4, '0')}_future`,
      });
      fs.mkdirSync(path.join(future, 'meta'));
      fs.writeFileSync(path.join(future, 'meta', '_journal.json'), JSON.stringify(journal));

      const name = await backupBeforeMigrations(paths, future);
      expect(name).toMatch(/^pcshop-backup-/);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(paths.backupsDir, name!, 'manifest.json'), 'utf8'),
      );
      expect(manifest).toMatchObject({
        reason: 'pre_migration',
        schemaVersion: appSchemaVersion(MIGRATIONS_FOLDER),
      });
    } finally {
      fs.rmSync(future, { recursive: true, force: true });
    }
    // Reopen for afterEach.
    ({ app } = await createFileTestApp(paths.root));
  });
});
