import { describe, expect, it } from 'vitest';
import { baht } from './money';
import {
  allocateRefund,
  applyPriceChange,
  averageAfterRemoval,
  cartTotals,
  checkPayment,
  correctedAverageCost,
  discountBadgeLabel,
  discountPercent,
  endDiscount,
  isDiscounted,
  lineSavingsSatang,
  lineTotalSatang,
  movingAverageCost,
  netSalesSatang,
  saleProfitSatang,
  totalCostSatang,
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

describe('correctedAverageCost', () => {
  it('applies the correction to all units when none were sold', () => {
    // 2 received at 100 (provisional), true cost 120, both still here → 120
    expect(correctedAverageCost(2, baht(100), 2, baht(100), baht(120))).toBe(baht(120));
  });

  it('applies it only to units that can still be on hand', () => {
    // 2 received at 100, 1 sold, true cost 120 → the remaining unit is 120 (not 140)
    expect(correctedAverageCost(1, baht(100), 2, baht(100), baht(120))).toBe(baht(120));
    // 100 received, 99 sold, +50 each → the last unit is 150, not 5,100
    expect(correctedAverageCost(1, baht(100), 100, baht(100), baht(150))).toBe(baht(150));
  });

  it('mixes with older stock and never goes below zero or changes with nothing on hand', () => {
    // 3 older units at 100 + 2 received at 100 provisional → true 50: (5×100 − 2×50) / 5 = 80
    expect(correctedAverageCost(5, baht(100), 2, baht(100), baht(50))).toBe(baht(80));
    expect(correctedAverageCost(1, baht(10), 1, baht(100), 0)).toBe(0);
    expect(correctedAverageCost(0, baht(100), 2, baht(100), baht(999))).toBe(baht(100));
  });
});

describe('averageAfterRemoval', () => {
  it('reverses a receipt when stock remains', () => {
    // 4 at 100 then 4 at 120 → avg 110 over 8; remove the 4 at 120 → 100
    expect(averageAfterRemoval(8, baht(110), 4, baht(120))).toBe(baht(100));
  });

  it('returns null when nothing would be left or the value goes negative', () => {
    expect(averageAfterRemoval(4, baht(100), 4, baht(100))).toBeNull();
    expect(averageAfterRemoval(5, baht(10), 1, baht(100))).toBeNull();
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

describe('cart totals', () => {
  it('adds line totals, savings, and units', () => {
    const lines = [
      { unitPriceSatang: baht(80), regularPriceSatang: baht(100), qty: 2 }, // saves 40
      { unitPriceSatang: baht(1590), regularPriceSatang: null, qty: 1 },
      { unitPriceSatang: baht(500), regularPriceSatang: baht(450), qty: 3 }, // regular below price: no savings
    ];
    expect(lineTotalSatang(lines[0])).toBe(baht(160));
    expect(lineSavingsSatang(lines[0])).toBe(baht(40));
    expect(lineSavingsSatang(lines[2])).toBe(0);
    expect(cartTotals(lines)).toEqual({
      totalSatang: baht(160 + 1590 + 1500),
      savingsSatang: baht(40),
      itemCount: 6,
    });
  });

  it('is zero for an empty cart and rejects bad quantities', () => {
    expect(cartTotals([])).toEqual({ totalSatang: 0, savingsSatang: 0, itemCount: 0 });
    expect(() => lineTotalSatang({ unitPriceSatang: 100, qty: 0 })).toThrow(RangeError);
    expect(() => lineTotalSatang({ unitPriceSatang: 100, qty: 1.5 })).toThrow(RangeError);
  });

  it('sums cost', () => {
    expect(
      totalCostSatang([
        { unitCostSatang: baht(60), qty: 2 },
        { unitCostSatang: baht(1200), qty: 1 },
      ]),
    ).toBe(baht(1320));
  });
});

describe('checkPayment', () => {
  it('gives change for cash that covers the total', () => {
    expect(checkPayment('cash', baht(2000), baht(1590))).toEqual({
      ok: true,
      changeSatang: baht(410),
      problem: null,
    });
    expect(checkPayment('cash', baht(1590), baht(1590)).changeSatang).toBe(0);
  });

  it('refuses cash below the total', () => {
    expect(checkPayment('cash', baht(1500), baht(1590))).toEqual({
      ok: false,
      changeSatang: 0,
      problem: 'insufficient',
    });
  });

  it('requires a transfer to match the total exactly', () => {
    expect(checkPayment('transfer', baht(1590), baht(1590))).toEqual({
      ok: true,
      changeSatang: 0,
      problem: null,
    });
    expect(checkPayment('transfer', baht(1600), baht(1590)).problem).toBe('mismatch');
    expect(checkPayment('transfer', baht(1500), baht(1590)).problem).toBe('mismatch');
  });
});

describe('allocateRefund', () => {
  it('returns the line values when the full amount is refunded', () => {
    expect(allocateRefund(baht(300), [baht(100), baht(200)])).toEqual([baht(100), baht(200)]);
  });

  it('splits a reduced refund in proportion and always adds up exactly', () => {
    expect(allocateRefund(baht(150), [baht(100), baht(200)])).toEqual([baht(50), baht(100)]);
    const shares = allocateRefund(100, [1, 1, 1]);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('never gives a line more than it was worth or a negative share', () => {
    const shares = allocateRefund(1, [1, 1, 0]);
    expect(shares).toEqual([1, 0, 0]);
    expect(allocateRefund(0, [baht(10), baht(20)])).toEqual([0, 0]);
  });

  it('handles zero-value lines and empty input', () => {
    expect(allocateRefund(0, [0, 0])).toEqual([0, 0]);
    expect(allocateRefund(0, [])).toEqual([]);
    expect(() => allocateRefund(-1, [100])).toThrow(RangeError);
  });
});

describe('sale profit', () => {
  it('takes refunds out of sales and returned cost out of cost', () => {
    const figures = {
      totalSatang: baht(1000),
      refundedSatang: baht(300),
      totalCostSatang: baht(700),
      returnedCostSatang: baht(200),
    };
    expect(netSalesSatang(figures)).toBe(baht(700));
    expect(saleProfitSatang(figures)).toBe(baht(200)); // 700 − (700 − 200)
    expect(saleProfitSatang({ ...figures, refundedSatang: 0, returnedCostSatang: 0 })).toBe(
      baht(300),
    );
  });
});
