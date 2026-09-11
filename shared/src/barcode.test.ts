import { describe, expect, it } from 'vitest';
import { looksLikeThaiLayout, normalizeScannedCode, thaiToQwerty } from './barcode';

describe('Thai keyboard layout → QWERTY', () => {
  it('recovers an EAN-13 barcode scanned with the Thai layout active', () => {
    // "8850999220000" typed on a Kedmanee keyboard
    expect(thaiToQwerty('คคถจตตต//จจจจ')).toBe('8850999220000');
  });

  it('maps every digit key', () => {
    expect(thaiToQwerty('ๅ/-ภถุึคตจ')).toBe('1234567890');
  });

  it('maps letters (unshifted and shifted) for alphanumeric SKUs and serials', () => {
    // "SN-ab12" with the Thai layout → S (shift) N (shift) - a b 1 2
    expect(thaiToQwerty('ฆ์ขฟิๅ/')).toBe('SN-ab12');
  });

  it('only converts when the text contains Thai characters', () => {
    expect(looksLikeThaiLayout('8850999220000')).toBe(false);
    expect(normalizeScannedCode(' 8850999220000 ')).toBe('8850999220000');
    expect(normalizeScannedCode('CPU-0001')).toBe('CPU-0001');
    expect(normalizeScannedCode('คคถจ')).toBe('8850');
  });
});
