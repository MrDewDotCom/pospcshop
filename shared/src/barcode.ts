// USB barcode scanners act as keyboards: they "type" the code. If Windows is set to the Thai keyboard
// layout (Kedmanee), a scanned "8850999220000" arrives as "ค ค ถ จ ต ต ต / / จ …" (without spaces).
// thaiToQwerty maps each character back to the key that produced it.

// Key pairs: [QWERTY character, Thai character produced by the same key], laid out by keyboard row.
// prettier-ignore
const UNSHIFTED: [string, string][] = [
  ['`', '_'], ['1', 'ๅ'], ['2', '/'], ['3', '-'], ['4', 'ภ'], ['5', 'ถ'], ['6', 'ุ'], ['7', 'ึ'],
  ['8', 'ค'], ['9', 'ต'], ['0', 'จ'], ['-', 'ข'], ['=', 'ช'],
  ['q', 'ๆ'], ['w', 'ไ'], ['e', 'ำ'], ['r', 'พ'], ['t', 'ะ'], ['y', 'ั'], ['u', 'ี'], ['i', 'ร'],
  ['o', 'น'], ['p', 'ย'], ['[', 'บ'], [']', 'ล'], ['\\', 'ฃ'],
  ['a', 'ฟ'], ['s', 'ห'], ['d', 'ก'], ['f', 'ด'], ['g', 'เ'], ['h', '้'], ['j', '่'], ['k', 'า'],
  ['l', 'ส'], [';', 'ว'], ["'", 'ง'],
  ['z', 'ผ'], ['x', 'ป'], ['c', 'แ'], ['v', 'อ'], ['b', 'ิ'], ['n', 'ื'], ['m', 'ท'], [',', 'ม'],
  ['.', 'ใ'], ['/', 'ฝ'],
];

// prettier-ignore
const SHIFTED: [string, string][] = [
  ['~', '%'], ['!', '+'], ['@', '๑'], ['#', '๒'], ['$', '๓'], ['%', '๔'], ['^', 'ู'], ['&', '฿'],
  ['*', '๕'], ['(', '๖'], [')', '๗'], ['_', '๘'], ['+', '๙'],
  ['Q', '๐'], ['W', '"'], ['E', 'ฎ'], ['R', 'ฑ'], ['T', 'ธ'], ['Y', 'ํ'], ['U', '๊'], ['I', 'ณ'],
  ['O', 'ฯ'], ['P', 'ญ'], ['{', 'ฐ'], ['}', ','], ['|', 'ฅ'],
  ['A', 'ฤ'], ['S', 'ฆ'], ['D', 'ฏ'], ['F', 'โ'], ['G', 'ฌ'], ['H', '็'], ['J', '๋'], ['K', 'ษ'],
  ['L', 'ศ'], [':', 'ซ'], ['"', '.'],
  ['Z', '('], ['X', ')'], ['C', 'ฉ'], ['V', 'ฮ'], ['B', 'ฺ'], ['N', '์'], ['M', '?'], ['<', 'ฒ'],
  ['>', 'ฬ'], ['?', 'ฦ'],
];

const THAI_TO_QWERTY = new Map<string, string>([...UNSHIFTED, ...SHIFTED].map(([q, t]) => [t, q]));
const THAI_CHAR = /[฀-๿]/;

/** True when the text contains Thai characters, i.e. it was probably typed with the Thai layout. */
export function looksLikeThaiLayout(text: string): boolean {
  return THAI_CHAR.test(text);
}

/** Converts text typed with the Thai Kedmanee layout into what the same keys give in QWERTY. */
export function thaiToQwerty(text: string): string {
  return Array.from(text, (char) => THAI_TO_QWERTY.get(char) ?? char).join('');
}

/**
 * Cleans a scanned or typed code (barcode/SKU/serial): trims it, and if it was typed with the Thai
 * layout, converts it back to QWERTY.
 */
export function normalizeScannedCode(text: string): string {
  const trimmed = text.trim();
  return looksLikeThaiLayout(trimmed) ? thaiToQwerty(trimmed) : trimmed;
}
