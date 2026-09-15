// Pricing rules. A "discount" is always a product price reduction (owner decision Q6): the product keeps
// its previous price as the regular price, and the UI shows a "-X%" badge. There are no manual discounts.

import { assertSatang, divRound } from './money';

export interface PriceState {
  /** Current selling price. null = "awaiting price" (can't be sold). */
  priceSatang: number | null;
  /** The price before the reduction. Only meaningful when greater than priceSatang. */
  regularPriceSatang: number | null;
}

export function isDiscounted({ priceSatang, regularPriceSatang }: PriceState): boolean {
  return priceSatang !== null && regularPriceSatang !== null && regularPriceSatang > priceSatang;
}

/** Discount percentage rounded DOWN to a whole number, so the shop never overstates it. */
export function discountPercent(state: PriceState): number | null {
  if (!isDiscounted(state)) return null;
  const price = state.priceSatang as number;
  const regular = state.regularPriceSatang as number;
  return Math.floor(((regular - price) * 100) / regular);
}

/** Badge text: "-20%", or "ลดราคา" when the reduction is under 1%. null when not discounted. */
export function discountBadgeLabel(state: PriceState): string | null {
  const percent = discountPercent(state);
  if (percent === null) return null;
  return percent >= 1 ? `-${percent}%` : 'ลดราคา';
}

/** How much the customer saves per unit (0 when not discounted). */
export function unitSavingsSatang(state: PriceState): number {
  return isDiscounted(state)
    ? (state.regularPriceSatang as number) - (state.priceSatang as number)
    : 0;
}

export interface PriceChangeInput {
  priceSatang: number;
  /**
   * undefined → apply the automatic rules (keep the old price as the regular price when lowering it).
   * null → clear the regular price. number → set it explicitly (e.g. a manufacturer's list price).
   */
  regularPriceSatang?: number | null;
}

/**
 * Computes the new price state when the owner changes a price.
 * - Lowering the price with no regular price set keeps the old price as the regular price (100 → 80 = "-20%").
 * - An existing regular price is kept while the new price is still below it.
 * - A regular price that isn't above the selling price is cleared (the product is no longer discounted).
 */
export function applyPriceChange(current: PriceState, input: PriceChangeInput): PriceState {
  const price = input.priceSatang;
  assertSatang(price, 'priceSatang');
  if (price < 0) throw new RangeError('priceSatang must not be negative');

  let regular: number | null;
  if (input.regularPriceSatang !== undefined) {
    regular = input.regularPriceSatang;
    if (regular !== null) assertSatang(regular, 'regularPriceSatang');
  } else if (current.regularPriceSatang !== null) {
    regular = current.regularPriceSatang;
  } else if (current.priceSatang !== null && price < current.priceSatang) {
    regular = current.priceSatang;
  } else {
    regular = null;
  }

  if (regular !== null && regular <= price) regular = null;
  return { priceSatang: price, regularPriceSatang: regular };
}

/** "End discount": the selling price goes back to the regular price. */
export function endDiscount(current: PriceState): PriceState {
  if (!isDiscounted(current)) return { ...current, regularPriceSatang: null };
  return { priceSatang: current.regularPriceSatang, regularPriceSatang: null };
}

// ---------- cart and checkout (PLAN.md §7.3–7.4) ----------
// The POS shows live totals with these functions and the server recomputes the sale with the same ones,
// so the screen and the stored document always agree. There is no discount or VAT step: prices are final
// (Q4, Q6). VAT, if it's ever added, becomes one extra step in `cartTotals`.

export interface CartLine {
  unitPriceSatang: number;
  /** Regular price snapshot; it only counts as savings when it's above the unit price. */
  regularPriceSatang: number | null;
  qty: number;
}

function assertQty(qty: number): void {
  if (!Number.isSafeInteger(qty) || qty <= 0)
    throw new RangeError('qty must be a positive integer');
}

export function lineTotalSatang(line: Pick<CartLine, 'unitPriceSatang' | 'qty'>): number {
  assertSatang(line.unitPriceSatang, 'unitPriceSatang');
  assertQty(line.qty);
  return line.unitPriceSatang * line.qty;
}

/** What the customer saves on a line compared with the regular price ("ประหยัดไป", P19). */
export function lineSavingsSatang(line: CartLine): number {
  return (
    unitSavingsSatang({
      priceSatang: line.unitPriceSatang,
      regularPriceSatang: line.regularPriceSatang,
    }) * line.qty
  );
}

export interface CartTotals {
  totalSatang: number;
  savingsSatang: number;
  /** Number of units (Σ qty). */
  itemCount: number;
}

export function cartTotals(lines: readonly CartLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (acc, line) => ({
      totalSatang: acc.totalSatang + lineTotalSatang(line),
      savingsSatang: acc.savingsSatang + lineSavingsSatang(line),
      itemCount: acc.itemCount + line.qty,
    }),
    { totalSatang: 0, savingsSatang: 0, itemCount: 0 },
  );
}

/** Owner only: Σ unit cost × qty. */
export function totalCostSatang(lines: readonly { unitCostSatang: number; qty: number }[]): number {
  return lines.reduce((sum, line) => {
    assertSatang(line.unitCostSatang, 'unitCostSatang');
    assertQty(line.qty);
    return sum + line.unitCostSatang * line.qty;
  }, 0);
}

export type PaymentProblem = 'insufficient' | 'mismatch';

export const PAYMENT_PROBLEM_MESSAGES: Record<PaymentProblem, string> = {
  insufficient: 'จำนวนเงินที่รับน้อยกว่ายอดที่ต้องชำระ',
  mismatch: 'ยอดโอนต้องเท่ากับยอดที่ต้องชำระพอดี',
};

export interface PaymentCheck {
  ok: boolean;
  /** Cash only: received − total. 0 for transfers and when the payment isn't valid. */
  changeSatang: number;
  problem: PaymentProblem | null;
}

/**
 * The payment step of checkout (Q9). Cash: the amount received must cover the total, and the change is
 * the difference. Transfer: the amount received must equal the total exactly — typing it is the explicit
 * confirmation that the money arrived.
 */
export function checkPayment(
  method: 'cash' | 'transfer',
  receivedSatang: number,
  totalSatang: number,
): PaymentCheck {
  assertSatang(receivedSatang, 'receivedSatang');
  assertSatang(totalSatang, 'totalSatang');
  if (method === 'transfer') {
    return receivedSatang === totalSatang
      ? { ok: true, changeSatang: 0, problem: null }
      : { ok: false, changeSatang: 0, problem: 'mismatch' };
  }
  return receivedSatang >= totalSatang
    ? { ok: true, changeSatang: receivedSatang - totalSatang, problem: null }
    : { ok: false, changeSatang: 0, problem: 'insufficient' };
}

// ---------- returns and profit (PLAN.md §7.8) ----------

/**
 * Splits a refund across return lines in proportion to what each line was worth (largest remainder, so
 * the shares always add up to the refund exactly and no share exceeds its line's value when the refund
 * doesn't exceed the total). Used when the owner overrides a return's refund amount (P21).
 */
export function allocateRefund(
  refundSatang: number,
  lineValuesSatang: readonly number[],
): number[] {
  assertSatang(refundSatang, 'refundSatang');
  if (refundSatang < 0) throw new RangeError('refundSatang must not be negative');
  lineValuesSatang.forEach((v) => {
    assertSatang(v, 'lineValueSatang');
    if (v < 0) throw new RangeError('line values must not be negative');
  });
  const totalValue = lineValuesSatang.reduce((a, b) => a + b, 0);
  if (lineValuesSatang.length === 0) return [];
  if (totalValue === 0) {
    // Nothing to weigh by: the whole refund sits on the first line.
    return lineValuesSatang.map((_, i) => (i === 0 ? refundSatang : 0));
  }
  const refund = BigInt(refundSatang);
  const total = BigInt(totalValue);
  const shares = lineValuesSatang.map((value, index) => {
    const exact = refund * BigInt(value);
    return { index, floor: exact / total, remainder: exact % total };
  });
  let left = refund - shares.reduce((sum, s) => sum + s.floor, 0n);
  const result = shares.map((s) => s.floor);
  // Hand the leftover satang to the largest remainders (earlier lines win ties).
  for (const s of [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (left === 0n) break;
    result[s.index] += 1n;
    left -= 1n;
  }
  return result.map(Number);
}

export interface SaleFigures {
  totalSatang: number;
  refundedSatang: number;
  totalCostSatang: number;
  /** Cost of the lines that came back (Σ return line unit cost × qty). */
  returnedCostSatang: number;
}

/** Net sales = sales − refunds (§7.8). */
export function netSalesSatang(
  figures: Pick<SaleFigures, 'totalSatang' | 'refundedSatang'>,
): number {
  return figures.totalSatang - figures.refundedSatang;
}

/** Owner only. Returned lines leave both revenue (the refund) and cost (their unit cost). */
export function saleProfitSatang(figures: SaleFigures): number {
  return netSalesSatang(figures) - (figures.totalCostSatang - figures.returnedCostSatang);
}

// ---------- cost (owner only; PLAN.md §7.2) ----------

/**
 * Moving weighted average cost after receiving `qty` units at `unitCostSatang`:
 * (onHand × avg + qty × unitCost) / (onHand + qty), rounded half-up. When nothing (or less than nothing)
 * is on hand, the old average means nothing, so the new unit cost becomes the average.
 */
export function movingAverageCost(
  onHand: number,
  averageSatang: number,
  qty: number,
  unitCostSatang: number,
): number {
  assertSatang(averageSatang, 'averageSatang');
  assertSatang(unitCostSatang, 'unitCostSatang');
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    throw new RangeError('qty must be a positive integer');
  }
  if (onHand <= 0) return unitCostSatang;
  return divRound(onHand * averageSatang + qty * unitCostSatang, onHand + qty);
}

/**
 * The average after the owner corrects a receipt line's provisional cost (owner decision, sub-task 12):
 * only units of that line that can still be on hand — min(onHand, qty) — absorb the difference. Units
 * already sold keep their sale's cost snapshot. Never below 0; unchanged when nothing is on hand.
 */
export function correctedAverageCost(
  onHand: number,
  averageSatang: number,
  receivedQty: number,
  provisionalCostSatang: number,
  finalCostSatang: number,
): number {
  assertSatang(averageSatang, 'averageSatang');
  assertSatang(provisionalCostSatang, 'provisionalCostSatang');
  assertSatang(finalCostSatang, 'finalCostSatang');
  if (onHand <= 0) return averageSatang;
  const affected = Math.min(onHand, receivedQty);
  const value = onHand * averageSatang + affected * (finalCostSatang - provisionalCostSatang);
  return Math.max(0, divRound(value, onHand));
}

/**
 * The average after taking `qty` units at `unitCostSatang` back out (voiding a receipt). Returns null
 * when the result isn't meaningful — nothing left on hand, or a negative remaining value — in which case
 * the caller keeps the current average.
 */
export function averageAfterRemoval(
  onHand: number,
  averageSatang: number,
  qty: number,
  unitCostSatang: number,
): number | null {
  assertSatang(averageSatang, 'averageSatang');
  assertSatang(unitCostSatang, 'unitCostSatang');
  const remaining = onHand - qty;
  if (remaining <= 0) return null;
  const value = onHand * averageSatang - qty * unitCostSatang;
  if (value < 0) return null;
  return divRound(value, remaining);
}
