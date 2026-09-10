// Document numbers such as "RC6909-0001" (receipt, B.E. 2569, September, #1).
// Tokens: {YYYY} {YY} (B.E. or C.E. per the shop setting), {MM}, {DD}, {SEQ:n} (zero-padded to n digits).

import type { BangkokParts } from './datetime';
import { toBuddhistYear } from './datetime';
import type { DocType, SequenceResetPolicy } from './enums';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  sale: 'ใบเสร็จรับเงิน',
  return: 'ใบรับคืนสินค้า',
  quote: 'ใบเสนอราคา',
  goods_receipt: 'ใบรับสินค้าเข้า',
  adjustment: 'ใบปรับสต็อก',
  repair: 'ใบรับซ่อม',
  claim: 'ใบเคลมสินค้า',
  trade_in: 'ใบรับซื้อสินค้า',
};

export const SEQUENCE_RESET_POLICY_LABELS: Record<SequenceResetPolicy, string> = {
  monthly: 'เริ่มนับใหม่ทุกเดือน',
  yearly: 'เริ่มนับใหม่ทุกปี',
  never: 'นับต่อเนื่องไม่รีเซ็ต',
};

export const DEFAULT_DOC_PREFIXES: Record<DocType, string> = {
  sale: 'RC',
  return: 'RT',
  quote: 'QT',
  goods_receipt: 'GR',
  adjustment: 'AJ',
  repair: 'RP',
  claim: 'CL',
  trade_in: 'TI',
};

export const defaultDocFormat = (docType: DocType) =>
  `${DEFAULT_DOC_PREFIXES[docType]}{YY}{MM}-{SEQ:4}`;

const TOKEN = /\{(YYYY|YY|MM|DD|SEQ(?::(\d))?)\}/g;

/** The key that decides when the running number restarts (always Gregorian, internal only). */
export function sequencePeriod(policy: SequenceResetPolicy, parts: BangkokParts): string {
  if (policy === 'monthly') return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  if (policy === 'yearly') return String(parts.year);
  return '';
}

export interface DocNumberContext {
  seq: number;
  parts: BangkokParts;
  buddhistEra: boolean;
}

export function formatDocNumber(
  format: string,
  { seq, parts, buddhistEra }: DocNumberContext,
): string {
  const year = buddhistEra ? toBuddhistYear(parts.year) : parts.year;
  return format.replace(TOKEN, (_match, token: string, width?: string) => {
    switch (token) {
      case 'YYYY':
        return String(year);
      case 'YY':
        return String(year % 100).padStart(2, '0');
      case 'MM':
        return String(parts.month).padStart(2, '0');
      case 'DD':
        return String(parts.day).padStart(2, '0');
      default:
        return String(seq).padStart(Number(width ?? 1), '0');
    }
  });
}

/**
 * Checks a format for the chosen reset policy. Returns a Thai error message, or null if it's valid.
 * A number that restarts every month must include the year and month, or numbers would repeat.
 */
export function validateDocFormat(format: string, policy: SequenceResetPolicy): string | null {
  if (!/\{SEQ(:\d)?\}/.test(format)) return 'ต้องมี {SEQ} หรือ {SEQ:4} สำหรับเลขลำดับ';
  if (format.length > 40) return 'รูปแบบยาวเกินไป';
  const unknown = format.replace(TOKEN, '').match(/[{}]/);
  if (unknown) return 'มีรหัสที่ระบบไม่รู้จัก ใช้ได้เฉพาะ {YYYY} {YY} {MM} {DD} {SEQ:4}';
  if (!/^[A-Za-z0-9{}:\-/_.]+$/.test(format)) {
    return 'ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และเครื่องหมาย - / _ .';
  }
  const hasYear = /\{YY(YY)?\}/.test(format);
  if (policy === 'monthly' && !(hasYear && format.includes('{MM}'))) {
    return 'ถ้าเริ่มนับใหม่ทุกเดือน ต้องมีปี ({YY} หรือ {YYYY}) และเดือน ({MM}) ด้วย ไม่เช่นนั้นเลขจะซ้ำกัน';
  }
  if (policy === 'yearly' && !hasYear) {
    return 'ถ้าเริ่มนับใหม่ทุกปี ต้องมีปี ({YY} หรือ {YYYY}) ด้วย ไม่เช่นนั้นเลขจะซ้ำกัน';
  }
  return null;
}
