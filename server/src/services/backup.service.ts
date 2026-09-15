// Backup and restore (PLAN.md §12).
//
// A backup is a folder: <dir>/pcshop-backup-YYYY-MM-DD_HHmmss/{shop.db, uploads/, manifest.json}.
// - shop.db comes from SQLite's online backup API (db.backup()), which is consistent even while the
//   shop keeps working. Never copy the live database file.
// - It's written to "<name>.partial" and renamed when complete, so a crashed backup never shows up.
// - backup-state.json (in the data dir, not the DB) remembers the last success: a restore replaces
//   the DB, but must not make the scheduler forget that today's backup already ran.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { count, eq } from 'drizzle-orm';
import {
  APP_VERSION,
  BACKUP_ID_PATTERN,
  fromBangkokParts,
  toBangkokParts,
  type BackupInfo,
  type BackupReason,
  type RestoreBackupInput,
  type RestoreBackupResult,
  type SessionUser,
} from '@pcshop/shared';
import type { DataPaths } from '../config';
import type { DatabaseManager } from '../db/client';
import { goodsReceipts, products, sales, sessions, shopSettings, users } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { findStockMismatches } from './stock.service';

const PREFIX = 'pcshop-backup-';
const PARTIAL = '.partial';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Manifest {
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  reason: BackupReason;
  productCount: number;
  goodsReceiptCount: number;
  /** Added in Phase 2; older manifests don't have it. */
  saleCount?: number;
  sizeBytes: number;
  ok: true;
}

export interface BackupState {
  lastSuccessAt: number | null;
  lastBackupId: string | null;
  lastError: { message: string; at: number } | null;
}

interface BackupContext {
  database: DatabaseManager;
  paths: DataPaths;
}

// ---------- settings & state ----------

export function backupSettings(ctx: BackupContext) {
  const row = ctx.database.db
    .select({
      dir: shopSettings.backupDir,
      keepCount: shopSettings.backupKeepCount,
      hour: shopSettings.backupHour,
    })
    .from(shopSettings)
    .get();
  return {
    customDirectory: row?.dir ?? null,
    directory: row?.dir || ctx.paths.backupsDir,
    keepCount: row?.keepCount ?? 14,
    hour: row?.hour ?? 22,
  };
}

export function readBackupState(paths: DataPaths): BackupState {
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.backupStateFile, 'utf8')) as BackupState;
    return {
      lastSuccessAt: parsed.lastSuccessAt ?? null,
      lastBackupId: parsed.lastBackupId ?? null,
      lastError: parsed.lastError ?? null,
    };
  } catch {
    return { lastSuccessAt: null, lastBackupId: null, lastError: null };
  }
}

function writeBackupState(paths: DataPaths, patch: Partial<BackupState>): void {
  const next = { ...readBackupState(paths), ...patch };
  fs.writeFileSync(paths.backupStateFile, JSON.stringify(next, null, 2));
}

/** Applied migrations in a database (0 for an empty or foreign file). */
function schemaVersionOf(sqlite: Database.Database): number {
  try {
    return (sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number })
      .n;
  } catch {
    return 0;
  }
}

/** Migrations this app version ships with. */
export function appSchemaVersion(migrationsFolder: string): number {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: unknown[] };
  return journal.entries.length;
}

// ---------- listing & pruning ----------

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

function readManifest(folder: string): Manifest | null {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'),
    ) as Manifest;
    return manifest.ok === true ? manifest : null;
  } catch {
    return null;
  }
}

/** Complete backups in `directory`, newest first. Unfinished (".partial") folders are ignored. */
export function listBackups(directory: string): BackupInfo[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isDirectory() && BACKUP_ID_PATTERN.test(e.name))
    .flatMap((e) => {
      const manifest = readManifest(path.join(directory, e.name));
      if (!manifest) return [];
      return [
        {
          id: e.name,
          createdAt: manifest.createdAt,
          reason: manifest.reason,
          sizeBytes: manifest.sizeBytes,
          appVersion: manifest.appVersion,
          schemaVersion: manifest.schemaVersion,
          productCount: manifest.productCount,
          goodsReceiptCount: manifest.goodsReceiptCount,
          saleCount: manifest.saleCount ?? 0,
        },
      ];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** Keeps the newest `keep` backups and removes leftovers of crashed backups. */
function prune(directory: string, keep: number): void {
  for (const backup of listBackups(directory).slice(keep)) {
    fs.rmSync(path.join(directory, backup.id), { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(directory)) {
    if (entry.startsWith(PREFIX) && entry.endsWith(PARTIAL)) {
      fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
    }
  }
}

// ---------- creating ----------

function backupName(now: number, directory: string): string {
  const p = toBangkokParts(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${PREFIX}${p.year}-${pad(p.month)}-${pad(p.day)}_${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
  let name = base;
  for (let i = 2; fs.existsSync(path.join(directory, name)); i++) name = `${base}-${i}`;
  return name;
}

// One backup at a time: a manual click and the scheduler must not write the same folder.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Backs up the database (online backup API) and the uploads folder. Records success or failure in
 * backup-state.json and prunes old backups. `directory`/`keepCount` default to the shop settings.
 */
export function createBackup(
  ctx: BackupContext,
  reason: BackupReason,
  options: { directory?: string; keepCount?: number; now?: number } = {},
): Promise<BackupInfo> {
  return serialized(async () => {
    const settings = backupSettings(ctx);
    const directory = options.directory ?? settings.directory;
    const now = options.now ?? Date.now();
    try {
      fs.mkdirSync(directory, { recursive: true });
      const name = backupName(now, directory);
      const partial = path.join(directory, name + PARTIAL);
      fs.rmSync(partial, { recursive: true, force: true });
      fs.mkdirSync(partial);

      await ctx.database.sqlite.backup(path.join(partial, 'shop.db'));
      if (fs.existsSync(ctx.paths.uploadsDir)) {
        fs.cpSync(ctx.paths.uploadsDir, path.join(partial, 'uploads'), { recursive: true });
      } else {
        fs.mkdirSync(path.join(partial, 'uploads'));
      }

      const db = ctx.database.db;
      const manifest: Manifest = {
        appVersion: APP_VERSION,
        schemaVersion: schemaVersionOf(ctx.database.sqlite),
        createdAt: new Date(now).toISOString(),
        reason,
        productCount: db.select({ n: count() }).from(products).get()!.n,
        goodsReceiptCount: db.select({ n: count() }).from(goodsReceipts).get()!.n,
        saleCount: db.select({ n: count() }).from(sales).get()!.n,
        sizeBytes: 0,
        ok: true,
      };
      manifest.sizeBytes = dirSize(partial);
      fs.writeFileSync(path.join(partial, 'manifest.json'), JSON.stringify(manifest, null, 2));
      fs.renameSync(partial, path.join(directory, name));

      prune(directory, Math.max(1, options.keepCount ?? settings.keepCount));
      writeBackupState(ctx.paths, { lastSuccessAt: now, lastBackupId: name, lastError: null });
      return listBackups(directory).find((b) => b.id === name)!;
    } catch (error) {
      writeBackupState(ctx.paths, {
        lastError: { message: error instanceof Error ? error.message : String(error), at: now },
      });
      throw new AppError(
        500,
        'BACKUP_FAILED',
        `สำรองข้อมูลไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

// ---------- schedule ----------

/**
 * True when the daily backup is due: the most recent "backup hour" (today's, or yesterday's if that
 * hour hasn't come yet today) has passed without a successful backup since. So a PC that was off at
 * that hour backs up at its next start.
 */
export function isBackupDue(now: number, hour: number, lastSuccessAt: number | null): boolean {
  const p = toBangkokParts(now);
  let slot = fromBangkokParts(p.year, p.month, p.day, hour);
  if (now < slot) slot -= DAY_MS;
  return lastSuccessAt === null || lastSuccessAt < slot;
}

/** Checks hourly (and shortly after start) whether the daily backup is due, and runs it. */
export function startBackupScheduler(app: FastifyInstance, ctx: BackupContext): () => void {
  const check = async () => {
    try {
      const { hour } = backupSettings(ctx);
      if (!isBackupDue(Date.now(), hour, readBackupState(ctx.paths).lastSuccessAt)) return;
      const backup = await createBackup(ctx, 'scheduled');
      app.log.info(`Scheduled backup created: ${backup.id}`);
    } catch (error) {
      app.log.error({ err: error }, 'Scheduled backup failed');
    }
  };
  const first = setTimeout(() => void check(), 30_000);
  const hourly = setInterval(() => void check(), 60 * 60 * 1000);
  first.unref();
  hourly.unref();
  return () => {
    clearTimeout(first);
    clearInterval(hourly);
  };
}

// ---------- before migrations (P9) ----------

/**
 * If the app update brings new migrations and the database already has data, back it up before the
 * migrations run (DatabaseManager applies them when it opens the file). Call before opening it.
 */
export async function backupBeforeMigrations(
  paths: DataPaths,
  migrationsFolder: string,
): Promise<string | null> {
  if (!fs.existsSync(paths.dbFile)) return null;
  const sqlite = new Database(paths.dbFile, { fileMustExist: true });
  try {
    const applied = schemaVersionOf(sqlite);
    if (applied === 0 || applied >= appSchemaVersion(migrationsFolder)) return null;
    let directory = paths.backupsDir;
    try {
      const row = sqlite.prepare('select backup_dir as dir from shop_settings').get() as
        { dir: string | null } | undefined;
      if (row?.dir) directory = row.dir;
    } catch {
      // no settings table yet: use the default folder
    }
    fs.mkdirSync(directory, { recursive: true });
    const name = backupName(Date.now(), directory);
    const partial = path.join(directory, name + PARTIAL);
    fs.mkdirSync(partial);
    await sqlite.backup(path.join(partial, 'shop.db'));
    if (fs.existsSync(paths.uploadsDir)) {
      fs.cpSync(paths.uploadsDir, path.join(partial, 'uploads'), { recursive: true });
    }
    const manifest: Manifest = {
      appVersion: APP_VERSION,
      schemaVersion: applied,
      createdAt: new Date().toISOString(),
      reason: 'pre_migration',
      productCount: 0,
      goodsReceiptCount: 0,
      saleCount: 0,
      sizeBytes: dirSize(partial),
      ok: true,
    };
    fs.writeFileSync(path.join(partial, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.renameSync(partial, path.join(directory, name));
    return name;
  } finally {
    sqlite.close();
  }
}

// ---------- restore ----------

/** Checks that `folder` holds a usable backup of this app, and returns its database file. */
function validateBackupFolder(folder: string, migrationsFolder: string): string {
  const dbFile = path.join(folder, 'shop.db');
  if (!fs.existsSync(dbFile)) {
    throw badRequest(
      'BACKUP_INVALID',
      'โฟลเดอร์นี้ไม่ใช่ข้อมูลสำรองของโปรแกรม (ไม่พบไฟล์ shop.db)',
    );
  }
  let sqlite: Database.Database | null = null;
  try {
    sqlite = new Database(dbFile, { readonly: true, fileMustExist: true });
    const check = sqlite.pragma('integrity_check', { simple: true });
    if (check !== 'ok') throw new Error(String(check));
    sqlite.prepare('select id from shop_settings limit 1').get();
    const version = schemaVersionOf(sqlite);
    if (version > appSchemaVersion(migrationsFolder)) {
      throw badRequest(
        'BACKUP_TOO_NEW',
        'ข้อมูลสำรองนี้มาจากโปรแกรมเวอร์ชันใหม่กว่า กรุณาอัปเดตโปรแกรมก่อนกู้คืน',
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw badRequest('BACKUP_INVALID', 'ไฟล์ข้อมูลสำรองเสียหายหรือไม่ใช่ข้อมูลของโปรแกรมนี้');
  } finally {
    sqlite?.close();
  }
  return dbFile;
}

/** Puts a backup folder's database and images in place of the current ones (DB must be closed). */
function swapInBackup(folder: string, paths: DataPaths): void {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(paths.dbFile + suffix, { force: true });
  // The backup file is a closed, self-contained copy made by the backup API, so copying it is safe.
  fs.copyFileSync(path.join(folder, 'shop.db'), paths.dbFile);
  const uploads = path.join(folder, 'uploads');
  if (fs.existsSync(uploads)) {
    const old = `${paths.uploadsDir}.old-${Date.now()}`;
    if (fs.existsSync(paths.uploadsDir)) fs.renameSync(paths.uploadsDir, old);
    fs.cpSync(uploads, paths.uploadsDir, { recursive: true });
    fs.rmSync(old, { recursive: true, force: true });
  }
}

/**
 * Restores a backup (PLAN.md §12): validate → back up the current state (safety net) → pause API
 * requests → close the DB → swap in the backup's shop.db and uploads → reopen (older backups get the
 * newer migrations) → sign everyone out → check stock integrity. If anything fails after the swap
 * started, the safety backup is put back.
 */
export async function restoreBackup(
  app: FastifyInstance,
  actor: SessionUser,
  input: RestoreBackupInput,
): Promise<RestoreBackupResult> {
  const ctx = { database: app.database, paths: app.paths! };
  if (ctx.database.file === ':memory:')
    throw conflict('RESTORE_UNAVAILABLE', 'กู้คืนไม่ได้ในโหมดนี้');
  const { directory } = backupSettings(ctx);

  let folder: string;
  if (input.backupId) {
    folder = path.join(directory, input.backupId);
    if (!fs.existsSync(folder) || !readManifest(folder)) throw notFound('ไม่พบข้อมูลสำรองนี้');
  } else {
    folder = path.resolve(input.path!);
    if (!path.isAbsolute(input.path!) || !fs.existsSync(folder)) {
      throw badRequest(
        'BACKUP_PATH_NOT_FOUND',
        'ไม่พบโฟลเดอร์ที่ระบุ กรุณาใส่ที่อยู่เต็ม เช่น E:\\pcshop-backup-…',
      );
    }
  }
  validateBackupFolder(folder, ctx.database.migrations);

  app.maintenance.reason = 'restore';
  try {
    const safety = await createBackup(ctx, 'pre_restore');
    const safetyFolder = path.join(directory, safety.id);
    try {
      ctx.database.reopenAfter(() => swapInBackup(folder, ctx.paths));
    } catch (error) {
      app.log.error({ err: error }, 'Restore failed; putting the safety backup back');
      ctx.database.reopenAfter(() => swapInBackup(safetyFolder, ctx.paths));
      throw new AppError(500, 'RESTORE_FAILED', 'กู้คืนไม่สำเร็จ ข้อมูลเดิมถูกนำกลับมาแล้ว');
    }

    const db = ctx.database.db;
    db.delete(sessions).run(); // everyone logs in again (the backup's sessions are stale too)
    const actorStillExists = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, actor.id))
      .get();
    writeAudit(db, {
      userId: actorStillExists ? actor.id : null,
      action: 'backup.restore',
      detail: { restoredFrom: folder, safetyBackupId: safety.id, by: actor.name },
    });
    const mismatches = findStockMismatches(db);
    if (mismatches.length) app.log.warn({ mismatches }, 'Stock integrity mismatch after restore');
    return { restoredFrom: path.basename(folder), safetyBackupId: safety.id };
  } finally {
    app.maintenance.reason = null;
  }
}

/** Free space on the drive holding `directory`, or null when unknown. */
export function freeBytes(directory: string): number | null {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const stats = fs.statfsSync(directory);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}
