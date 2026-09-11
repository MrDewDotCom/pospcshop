import { describe, expect, it } from 'vitest';
import { baht } from './money';
import {
  applyPriceChange,
  discountBadgeLabel,
  discountPercent,
  endDiscount,
  isDiscounted,
  movingAverageCost,
  unitSavingsSatang,
  type PriceState,
} from './pricing';

describe('movingAverageCost', () => {
  it('weights the old average by stock on hand', () => {
    // 2 units at 100 + 2 units at 200 → 150
    expect(movingAverageCost(2, baht(100), 2, baht(200))).toBe(baht(150));
    // 1 at 100.00 + 2 at 100.01 → 100.0066… → rounds to 100.01
    expect(movingAverageCost(1, 10_000, 2, 10_001)).toBe(10_001);
    // 2 at 100.00 + 1 at 100.01 → 100.0033… → rounds to 100.00
    expect(movingAverageCost(2, 10_000, 1, 10_001)).toBe(10_000);
  });

  it('uses the new cost when nothing is on hand', () => {
    expect(movingAverageCost(0, baht(999), 3, baht(120))).toBe(baht(120));
    expect(movingAverageCost(-2, baht(999), 3, baht(120))).toBe(baht(120));
  });

  it('rejects a non-positive quantity', () => {
    expect(() => movingAverageCost(1, 100, 0, 100)).toThrow(RangeError);
  });
});

const priced = (price: number | null, regular: number | null = null): PriceState => ({
  priceSatang: price === null ? null : baht(price),
  regularPriceSatang: regular === null ? null : baht(regular),
});

describe('discount badge', () => {
  it('shows -20% for 100 → 80 (the owner example)', () => {
    const state = priced(80, 100);
    expect(isDiscounted(state)).toBe(true);
    expect(discountPercent(state)).toBe(20);
    expect(discountBadgeLabel(state)).toBe('-20%');
    expect(unitSavingsSatang(state)).toBe(baht(20));
  });

  it('rounds the percentage down', () => {
    expect(discountPercent(priced(79, 100))).toBe(21);
    expect(discountPercent(priced(1590, 1990))).toBe(20); // 20.1% → 20
    expect(discountPercent(priced(1599, 1990))).toBe(19); // 19.65% → 19, never 20
  });

  it('uses a text label when the reduction is under 1%', () => {
    const state = { priceSatang: 999_900, regularPriceSatang: 1_000_000 };
    expect(discountPercent(state)).toBe(0);
    expect(discountBadgeLabel(state)).toBe('ลดราคา');
  });

  it('is not discounted without a higher regular price or without a price', () => {
    for (const state of [priced(100), priced(100, 100), priced(100, 90), priced(null, 100)]) {
      expect(isDiscounted(state)).toBe(false);
      expect(discountPercent(state)).toBeNull();
      expect(discountBadgeLabel(state)).toBeNull();
      expect(unitSavingsSatang(state)).toBe(0);
    }
  });
});

describe('applyPriceChange', () => {
  it('keeps the old price as the regular price when lowering it', () => {
    expect(applyPriceChange(priced(100), { priceSatang: baht(80) })).toEqual(priced(80, 100));
  });

  it('keeps an existing regular price while still below it', () => {
    expect(applyPriceChange(priced(80, 100), { priceSatang: baht(70) })).toEqual(priced(70, 100));
    expect(applyPriceChange(priced(80, 100), { priceSatang: baht(90) })).toEqual(priced(90, 100));
  });

  it('clears the regular price when the price goes back up to or above it', () => {
    expect(applyPriceChange(priced(80, 100), { priceSatang: baht(100) })).toEqual(priced(100));
    expect(applyPriceChange(priced(80, 100), { priceSatang: baht(120) })).toEqual(priced(120));
  });

  it('does not create a regular price when raising a price or setting the first price', () => {
    expect(applyPriceChange(priced(100), { priceSatang: baht(120) })).toEqual(priced(120));
    expect(applyPriceChange(priced(null), { priceSatang: baht(100) })).toEqual(priced(100));
  });

  it('honours an explicitly set or cleared regular price', () => {
    expect(
      applyPriceChange(priced(100), { priceSatang: baht(100), regularPriceSatang: baht(150) }),
    ).toEqual(priced(100, 150));
    expect(
      applyPriceChange(priced(80, 100), { priceSatang: baht(80), regularPriceSatang: null }),
    ).toEqual(priced(80));
    // An explicit regular price that isn't higher than the price is ignored.
    expect(
      applyPriceChange(priced(100), { priceSatang: baht(100), regularPriceSatang: baht(90) }),
    ).toEqual(priced(100));
  });

  it('rejects negative or fractional prices', () => {
    expect(() => applyPriceChange(priced(100), { priceSatang: -1 })).toThrow(RangeError);
    expect(() => applyPriceChange(priced(100), { priceSatang: 10.5 })).toThrow(RangeError);
  });
});

describe('endDiscount', () => {
  it('restores the regular price', () => {
    expect(endDiscount(priced(80, 100))).toEqual(priced(100));
  });

  it('leaves an undiscounted price alone', () => {
    expect(endDiscount(priced(100))).toEqual(priced(100));
    expect(endDiscount(priced(100, 90))).toEqual(priced(100));
  });
});
