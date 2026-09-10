import { describe, expect, it } from 'vitest';
import { baht, divRound, formatBaht, isSatang, parseBahtInput, satangToInput } from './money';

describe('divRound', () => {
  it('divides exactly when there is no remainder', () => {
    expect(divRound(100, 4)).toBe(25);
  });

  it('rounds half up for positive values', () => {
    expect(divRound(5, 2)).toBe(3); // 2.5 → 3
    expect(divRound(7, 3)).toBe(2); // 2.33 → 2
    expect(divRound(8, 3)).toBe(3); // 2.67 → 3
  });

  it('rounds half away from zero for negative values', () => {
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(5, -2)).toBe(-3);
    expect(divRound(-7, 3)).toBe(-2);
    expect(divRound(-5, -2)).toBe(3);
  });

  it('stays exact for large safe integers', () => {
    const big = Number.MAX_SAFE_INTEGER; // 2^53 - 1, odd
    expect(divRound(big, 1)).toBe(big);
    expect(divRound(big - 1, 2)).toBe((big - 1) / 2);
  });

  it('rejects non-integers and zero denominators', () => {
    expect(() => divRound(1.5, 2)).toThrow(RangeError);
    expect(() => divRound(1, 0)).toThrow(RangeError);
  });
});

describe('parseBahtInput', () => {
  it.each([
    ['1290', 129000],
    ['1,290', 129000],
    ['฿1,290.50', 129050],
    ['1290.5', 129050],
    ['0.01', 1],
    ['12.', 1200],
    [' 45 ', 4500],
    ['0', 0],
  ])('parses %s', (input, expected) => {
    expect(parseBahtInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-5', '1e3', '12..5'])('rejects %s', (input) => {
    expect(parseBahtInput(input)).toBeNull();
  });

  it('avoids float artifacts', () => {
    // 19.99 * 100 = 1998.9999999999998 in floating point
    expect(parseBahtInput('19.99')).toBe(1999);
  });
});

describe('formatting', () => {
  it('formats with thousand separators and two decimals by default', () => {
    expect(formatBaht(129000)).toBe('1,290.00');
    expect(formatBaht(123456789)).toBe('1,234,567.89');
    expect(formatBaht(5)).toBe('0.05');
  });

  it('supports the baht symbol and automatic decimals', () => {
    expect(formatBaht(129000, { symbol: true, decimals: 'auto' })).toBe('฿1,290');
    expect(formatBaht(129050, { symbol: true, decimals: 'auto' })).toBe('฿1,290.50');
  });

  it('formats negative amounts', () => {
    expect(formatBaht(-2000, { symbol: true })).toBe('-฿20.00');
  });

  it('produces editable input text that round-trips through the parser', () => {
    for (const value of [0, 1, 99, 100, 129000, 129050, 1999]) {
      expect(parseBahtInput(satangToInput(value))).toBe(value);
    }
  });

  it('converts baht to satang', () => {
    expect(baht(1290)).toBe(129000);
    expect(isSatang(baht(1290))).toBe(true);
    expect(isSatang(12.5)).toBe(false);
  });
});
