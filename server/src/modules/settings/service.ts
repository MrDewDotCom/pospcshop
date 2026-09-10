import { eq } from 'drizzle-orm';
import {
  DOC_TYPES,
  type DocType,
  type DocumentSequence,
  type OwnerShopSettings,
  type SessionUser,
  type UpdateDocumentSequenceInput,
  type UpdateShopSettingsInput,
  sequencePeriod,
  toBangkokParts,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { documentSequences, files, shopSettings } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { toIso } from '../../lib/time';
import { ensureDefaultSequences, previewDocNumber } from '../../services/numbering.service';

export function uploadUrl(path: string): string {
  return `/uploads/${path}`;
}

/** Full settings (the route narrows them for staff with respondByRole). */
export function getSettings(db: AppDatabase): OwnerShopSettings {
  const row = db.select().from(shopSettings).get();
  if (!row) throw notFound('ยังไม่ได้ตั้งค่าร้าน');
  const logo = row.logoFileId
    ? db.select({ path: files.path }).from(files).where(eq(files.id, row.logoFileId)).get()
    : undefined;
  return {
    shopName: row.shopName,
    logoFileId: row.logoFileId,
    logoUrl: logo ? uploadUrl(logo.path) : null,
    address: row.address,
    phone: row.phone,
    lineId: row.lineId,
    promptpayId: row.promptpayId,
    receiptFooter: row.receiptFooter,
    useBuddhistEra: row.useBuddhistEra,
    allowNegativeStock: row.allowNegativeStock,
    defaultAssemblyFeeSatang: row.defaultAssemblyFeeSatang,
    updatedAt: toIso(row.updatedAt),
  };
}

export function updateSettings(
  db: AppDatabase,
  actor: SessionUser,
  input: UpdateShopSettingsInput,
): OwnerShopSettings {
  db.transaction((tx) => {
    const before = tx.select().from(shopSettings).get();
    if (!before) throw notFound('ยังไม่ได้ตั้งค่าร้าน');
    if (input.logoFileId != null) {
      const exists = tx
        .select({ id: files.id })
        .from(files)
        .where(eq(files.id, input.logoFileId))
        .get();
      if (!exists) throw badRequest('LOGO_NOT_FOUND', 'ไม่พบไฟล์โลโก้ กรุณาอัปโหลดใหม่');
    }
    tx.update(shopSettings).set(input).where(eq(shopSettings.id, 1)).run();

    const changed = (Object.keys(input) as (keyof UpdateShopSettingsInput)[]).filter(
      (key) => before[key] !== input[key],
    );
    if (changed.length > 0) {
      writeAudit(tx, { userId: actor.id, action: 'settings.update', detail: { fields: changed } });
    }
  });
  return getSettings(db);
}

export function listSequences(db: AppDatabase, now = Date.now()): DocumentSequence[] {
  ensureDefaultSequences(db);
  const rows = db.select().from(documentSequences).all();
  return DOC_TYPES.map((docType) => {
    const row = rows.find((r) => r.docType === docType)!;
    return {
      docType,
      format: row.format,
      resetPolicy: row.resetPolicy,
      lastNumber: row.lastNumber,
      nextNumberPreview: previewDocNumber(db, docType, now),
    };
  });
}

/**
 * Changes a document number format. The running number continues within the current period, so
 * switching formats or reset policies mid-month can't produce a number that was already used.
 */
export function updateSequence(
  db: AppDatabase,
  actor: SessionUser,
  docType: DocType,
  input: UpdateDocumentSequenceInput,
  now = Date.now(),
): DocumentSequence {
  db.transaction((tx) => {
    ensureDefaultSequences(tx);
    const before = tx
      .select()
      .from(documentSequences)
      .where(eq(documentSequences.docType, docType))
      .get()!;
    tx.update(documentSequences)
      .set({
        format: input.format,
        resetPolicy: input.resetPolicy,
        currentPeriod: sequencePeriod(input.resetPolicy, toBangkokParts(now)),
      })
      .where(eq(documentSequences.docType, docType))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'sequence.update',
      detail: {
        docType,
        from: { format: before.format, resetPolicy: before.resetPolicy },
        to: input,
      },
    });
  });
  return listSequences(db, now).find((s) => s.docType === docType)!;
}
