// Amount in Thai words for receipts and return slips (P24), e.g. 129050 → "หนึ่งพันสองร้อยเก้าสิบบาทห้าสิบสตางค์".
// Follows the common BAHTTEXT convention: a trailing 1 after any higher digit reads "เอ็ด" (101 → หนึ่งร้อยเอ็ด,
// 1,000,001 → หนึ่งล้านเอ็ด), 1 and 2 in the tens place read "สิบ" and "ยี่สิบ", and millions repeat ("ล้านล้าน").

import { assertSatang, SATANG_PER_BAHT } from './money';

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** Words for 0 < n < 1,000,000. `afterHigher`: a higher group precedes it, so a lone 1 reads "เอ็ด". */
function groupWords(n: number, afterHigher: boolean): string {
  const digits = String(n).split('').map(Number);
  return digits
    .map((d, i) => {
      const place = digits.length - 1 - i;
      if (d === 0) return '';
      if (place === 1) return d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : `${DIGITS[d]}สิบ`;
      if (place === 0 && d === 1 && (digits.length > 1 || afterHigher)) return 'เอ็ด';
      return DIGITS[d] + PLACES[place];
    })
    .join('');
}

function integerWords(n: number): string {
  if (n === 0) return DIGITS[0];
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const high = millions > 0 ? `${integerWords(millions)}ล้าน` : '';
  return high + (rest > 0 ? groupWords(rest, millions > 0) : '');
}

/** A satang amount in Thai words: 100 → "หนึ่งบาทถ้วน", 50 → "ห้าสิบสตางค์", 0 → "ศูนย์บาทถ้วน". */
export function bahtText(satang: number): string {
  assertSatang(satang, 'satang');
  if (satang < 0) return `ลบ${bahtText(-satang)}`;
  const bahtPart = Math.floor(satang / SATANG_PER_BAHT);
  const satangPart = satang % SATANG_PER_BAHT;
  if (satangPart === 0) return `${integerWords(bahtPart)}บาทถ้วน`;
  const satangWords = `${integerWords(satangPart)}สตางค์`;
  return bahtPart === 0 ? satangWords : `${integerWords(bahtPart)}บาท${satangWords}`;
}
