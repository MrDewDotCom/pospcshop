import { describe, expect, it } from 'vitest';
import { bahtText } from './bahttext';
import { baht } from './money';

describe('bahtText', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [baht(1), 'หนึ่งบาทถ้วน'],
    [baht(10), 'สิบบาทถ้วน'],
    [baht(11), 'สิบเอ็ดบาทถ้วน'],
    [baht(12), 'สิบสองบาทถ้วน'],
    [baht(20), 'ยี่สิบบาทถ้วน'],
    [baht(21), 'ยี่สิบเอ็ดบาทถ้วน'],
    [baht(101), 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [baht(1001), 'หนึ่งพันเอ็ดบาทถ้วน'],
    [baht(1290), 'หนึ่งพันสองร้อยเก้าสิบบาทถ้วน'],
    [baht(45_900), 'สี่หมื่นห้าพันเก้าร้อยบาทถ้วน'],
    [baht(250_000), 'สองแสนห้าหมื่นบาทถ้วน'],
  ])('reads %i satang as %s', (satang, words) => {
    expect(bahtText(satang)).toBe(words);
  });

  it('reads satang', () => {
    expect(bahtText(129_050)).toBe('หนึ่งพันสองร้อยเก้าสิบบาทห้าสิบสตางค์');
    expect(bahtText(50)).toBe('ห้าสิบสตางค์');
    expect(bahtText(1)).toBe('หนึ่งสตางค์');
    expect(bahtText(21)).toBe('ยี่สิบเอ็ดสตางค์');
    expect(bahtText(baht(3) + 25)).toBe('สามบาทยี่สิบห้าสตางค์');
  });

  it('reads millions, including a trailing เอ็ด after ล้าน', () => {
    expect(bahtText(baht(1_000_000))).toBe('หนึ่งล้านบาทถ้วน');
    expect(bahtText(baht(1_000_001))).toBe('หนึ่งล้านเอ็ดบาทถ้วน');
    expect(bahtText(baht(11_000_000))).toBe('สิบเอ็ดล้านบาทถ้วน');
    expect(bahtText(baht(3_450_021) + 75)).toBe(
      'สามล้านสี่แสนห้าหมื่นยี่สิบเอ็ดบาทเจ็ดสิบห้าสตางค์',
    );
    expect(bahtText(baht(1_000_000_000_000))).toBe('หนึ่งล้านล้านบาทถ้วน');
  });

  it('reads negative amounts and rejects non-integers', () => {
    expect(bahtText(-baht(5))).toBe('ลบห้าบาทถ้วน');
    expect(() => bahtText(1.5)).toThrow(RangeError);
  });
});
