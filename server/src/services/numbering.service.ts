// Sequential document numbers (PLAN.md §7.5). A number is allocated inside the same transaction that
// creates the document, so numbers never repeat and never skip (a voided document keeps its number).

import { eq } from 'drizzle-orm';
import {
  DOC_TYPES,
  defaultDocFormat,
  formatDocNumber,
  sequencePeriod,
  toBangkokParts,
  type DocType,
} from '@pcshop/shared';
import type { AppDatabase } from '../db/client';
import { documentSequences, shopSettings } from '../db/schema';

type DbOrTx = Pick<AppDatabase, 'select' | 'insert' | 'update'>;

/** Creates any missing sequence rows with the default formats. Safe to call on every startup. */
export function ensureDefaultSequences(db: DbOrTx): void {
  db.insert(documentSequences)
    .values(
      DOC_TYPES.map((docType) => ({
        docType,
        format: defaultDocFormat(docType),
        resetPolicy: 'monthly' as const,
      })),
    )
    .onConflictDoNothing()
    .run();
}

function useBuddhistEra(db: DbOrTx): boolean {
  return db.select({ be: shopSettings.useBuddhistEra }).from(shopSettings).get()?.be ?? true;
}

function loadSequence(db: DbOrTx, docType: DocType) {
  let row = db.select().from(documentSequences).where(eq(documentSequences.docType, docType)).get();
  if (!row) {
    ensureDefaultSequences(db);
    row = db.select().from(documentSequences).where(eq(documentSequences.docType, docType)).get()!;
  }
  return row;
}

function nextFor(row: typeof documentSequences.$inferSelect, now: number) {
  const parts = toBangkokParts(now);
  const period = sequencePeriod(row.resetPolicy, parts);
  const seq = row.currentPeriod === period ? row.lastNumber + 1 : 1;
  return { parts, period, seq };
}

/** Allocates the next number. Must be called inside the transaction that inserts the document. */
export function allocateDocNumber(tx: DbOrTx, docType: DocType, now = Date.now()): string {
  const row = loadSequence(tx, docType);
  const { parts, period, seq } = nextFor(row, now);
  tx.update(documentSequences)
    .set({ lastNumber: seq, currentPeriod: period })
    .where(eq(documentSequences.docType, docType))
    .run();
  return formatDocNumber(row.format, { seq, parts, buddhistEra: useBuddhistEra(tx) });
}

/** The number the next document would get, without allocating it. */
export function previewDocNumber(db: DbOrTx, docType: DocType, now = Date.now()): string {
  const row = loadSequence(db, docType);
  const { parts, seq } = nextFor(row, now);
  return formatDocNumber(row.format, { seq, parts, buddhistEra: useBuddhistEra(db) });
}
