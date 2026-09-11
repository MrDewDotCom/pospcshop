import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  restoreBackupInputSchema,
  updateBackupSettingsInputSchema,
  type BackupInfo,
  type BackupOverview,
  type RestoreBackupResult,
} from '@pcshop/shared';
import { shopSettings } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict } from '../../lib/errors';
import { toIsoOrNull } from '../../lib/time';
import type { ZodTypeProvider } from '../../lib/zod';
import { requirePermission } from '../../plugins/auth';
import {
  backupSettings,
  createBackup,
  freeBytes,
  listBackups,
  readBackupState,
  restoreBackup,
} from '../../services/backup.service';

/** Makes sure the owner's chosen folder can hold backups (created if missing, writable). */
function assertUsableDirectory(directory: string): void {
  if (!path.isAbsolute(directory)) {
    throw badRequest(
      'BACKUP_DIR_NOT_ABSOLUTE',
      'กรุณาใส่ที่อยู่โฟลเดอร์แบบเต็ม เช่น D:\\PCShopBackup',
    );
  }
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, `.pcshop-write-test-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
  } catch {
    throw badRequest(
      'BACKUP_DIR_NOT_WRITABLE',
      'บันทึกไฟล์ลงโฟลเดอร์นี้ไม่ได้ (ไม่มีไดรฟ์นี้ หรือไม่มีสิทธิ์เขียน)',
    );
  }
}

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const manage = { preHandler: requirePermission('backup.manage') };
  const context = () => {
    if (!app.paths) throw conflict('BACKUP_UNAVAILABLE', 'ไม่มีโฟลเดอร์ข้อมูลสำหรับสำรองข้อมูล');
    return { database: app.database, paths: app.paths };
  };

  r.get('/api/backups', manage, async (): Promise<BackupOverview> => {
    const ctx = context();
    const settings = backupSettings(ctx);
    const state = readBackupState(ctx.paths);
    return {
      items: listBackups(settings.directory),
      directory: settings.directory,
      customDirectory: settings.customDirectory,
      defaultDirectory: ctx.paths.backupsDir,
      keepCount: settings.keepCount,
      hour: settings.hour,
      lastSuccessAt: toIsoOrNull(state.lastSuccessAt),
      lastError: state.lastError
        ? { message: state.lastError.message, at: new Date(state.lastError.at).toISOString() }
        : null,
      freeBytes: freeBytes(settings.directory),
    };
  });

  r.post('/api/backups', manage, async (request, reply): Promise<BackupInfo> => {
    const backup = await createBackup(context(), 'manual');
    writeAudit(app.database.db, {
      userId: request.user!.id,
      action: 'backup.create',
      detail: { backupId: backup.id },
    });
    return reply.code(201).send(backup);
  });

  r.put(
    '/api/backups/settings',
    { ...manage, schema: { body: updateBackupSettingsInputSchema } },
    async (request) => {
      const { directory, keepCount, hour } = request.body;
      if (directory) assertUsableDirectory(directory);
      const db = app.database.db;
      db.update(shopSettings)
        .set({ backupDir: directory, backupKeepCount: keepCount, backupHour: hour })
        .where(eq(shopSettings.id, 1))
        .run();
      writeAudit(db, {
        userId: request.user!.id,
        action: 'backup.settings',
        detail: { directory, keepCount, hour },
      });
      return backupSettings(context());
    },
  );

  // Replaces ALL shop data with the backup. Everyone (including the owner) must log in again.
  r.post(
    '/api/backups/restore',
    { ...manage, schema: { body: restoreBackupInputSchema } },
    async (request): Promise<RestoreBackupResult> =>
      restoreBackup(app, request.user!, request.body),
  );
}
