import { z } from 'zod';

export const BACKUP_REASONS = ['manual', 'scheduled', 'pre_restore', 'pre_migration'] as const;
export type BackupReason = (typeof BACKUP_REASONS)[number];
export const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  manual: 'สำรองด้วยตนเอง',
  scheduled: 'สำรองอัตโนมัติ',
  pre_restore: 'ก่อนกู้คืนข้อมูล',
  pre_migration: 'ก่อนอัปเดตระบบ',
};

/** Backup folder names, e.g. "pcshop-backup-2026-09-12_220003" (Bangkok time). */
export const BACKUP_ID_PATTERN = /^pcshop-backup-\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?$/;

export interface BackupInfo {
  /** Folder name inside the backup directory. */
  id: string;
  createdAt: string;
  reason: BackupReason;
  sizeBytes: number;
  appVersion: string;
  schemaVersion: number;
  productCount: number;
  goodsReceiptCount: number;
  saleCount: number;
}

export interface BackupOverview {
  items: BackupInfo[];
  /** Where backups go now (the custom folder, or the default inside the data directory). */
  directory: string;
  /** The owner's custom folder; null = the default. */
  customDirectory: string | null;
  defaultDirectory: string;
  keepCount: number;
  /** Bangkok hour (0–23) after which the daily automatic backup runs. */
  hour: number;
  lastSuccessAt: string | null;
  lastError: { message: string; at: string } | null;
  /** Free space on the backup drive, when the OS reports it. */
  freeBytes: number | null;
}

export const updateBackupSettingsInputSchema = z.object({
  /** Absolute folder path (e.g. D:\PCShopBackup or a USB drive). Blank = the default folder. */
  directory: z
    .string()
    .trim()
    .max(260, { error: 'ที่อยู่โฟลเดอร์ยาวเกินไป' })
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  keepCount: z
    .number()
    .int()
    .min(1, { error: 'เก็บอย่างน้อย 1 ชุด' })
    .max(365, { error: 'เก็บได้ไม่เกิน 365 ชุด' }),
  hour: z.number().int().min(0).max(23),
});
export type UpdateBackupSettingsInput = z.input<typeof updateBackupSettingsInputSchema>;

/** Restore one of the listed backups, or a backup folder elsewhere (e.g. on a USB drive). */
export const restoreBackupInputSchema = z
  .object({
    backupId: z.string().regex(BACKUP_ID_PATTERN, { error: 'ไม่พบข้อมูลสำรองนี้' }).optional(),
    path: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => (v.backupId === undefined) !== (v.path === undefined), {
    error: 'เลือกข้อมูลสำรองจากรายการ หรือระบุโฟลเดอร์ อย่างใดอย่างหนึ่ง',
  });
export type RestoreBackupInput = z.input<typeof restoreBackupInputSchema>;

export interface RestoreBackupResult {
  restoredFrom: string;
  /** The backup of the data as it was just before the restore (to undo it if needed). */
  safetyBackupId: string;
}
