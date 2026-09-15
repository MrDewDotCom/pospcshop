// Phone numbers are stored as typed (for display) plus a digits-only form used to find duplicates,
// so "08-1234-5678", "081 234 5678", "+66 81 234 5678" and Thai digits "๐๘๑๒๓๔๕๖๗๘" all match.

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/** Digits-only phone number with a +66 country code turned back into the local leading 0. */
export function normalizePhone(text: string): string {
  const digits = text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d))).replace(/\D/g, '');
  // Local numbers always start with 0, so 10–11 digits starting with 66 can only be +66 numbers
  // (mobile: 66 + 9 digits, Bangkok landline: 66 + 8 digits).
  if (digits.startsWith('66') && (digits.length === 10 || digits.length === 11)) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}
