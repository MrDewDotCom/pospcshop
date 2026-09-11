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
