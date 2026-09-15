import { z } from 'zod';
import { bangkokDateSchema } from './common';

/** Inclusive Bangkok date range; both default to today. At most one year. */
export const dashboardQuerySchema = z.object({
  from: bangkokDateSchema.optional(),
  to: bangkokDateSchema.optional(),
});
export type DashboardQuery = z.input<typeof dashboardQuerySchema>;

export const lowStockItemSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  onHand: z.number().int(),
  minStock: z.number().int(),
});
export type LowStockItem = z.infer<typeof lowStockItemSchema>;

/**
 * What everyone sees (Q13): activity, never money. Staff get only this; the owner schema adds
 * revenue, profit, and inventory value.
 */
const activitySchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Paid sales in the range (voided sales don't count). */
  saleCount: z.number().int(),
  /** Units sold in the range. */
  itemCount: z.number().int(),
  /** The same, for sales the current user rang up. */
  mySaleCount: z.number().int(),
  myItemCount: z.number().int(),
  /** Units customers brought back in the range. */
  returnedUnitCount: z.number().int(),
  /** Returned units still in quarantine (any date) and the return documents they're on. */
  pendingReturnUnits: z.number().int(),
  pendingReturnDocs: z.number().int(),
  /** Stock-tracked products at or below their minimum (0 < on hand ≤ min) and those out of stock. */
  lowStockCount: z.number().int(),
  outOfStockCount: z.number().int(),
  /** The most urgent ones (out of stock first). */
  lowStock: z.array(lowStockItemSchema),
});

export const dailySalesPointSchema = z.object({
  /** Bangkok date "YYYY-MM-DD". */
  date: z.string(),
  saleCount: z.number().int(),
  /** Sales minus refunds on that day. */
  netSalesSatang: z.number().int(),
});
export type DailySalesPoint = z.infer<typeof dailySalesPointSchema>;

export const bestSellerSchema = z.object({
  productId: z.number().int(),
  name: z.string(),
  sku: z.string(),
  /** Units sold minus units returned. */
  qty: z.number().int(),
  revenueSatang: z.number().int(),
});
export type BestSeller = z.infer<typeof bestSellerSchema>;

export const dashboardStaffSchema = activitySchema;
export const dashboardOwnerSchema = activitySchema.extend({
  grossSalesSatang: z.number().int(),
  refundTotalSatang: z.number().int(),
  netSalesSatang: z.number().int(),
  /** Net sales − (cost of sales − cost of returned units), by the date each event happened. */
  profitSatang: z.number().int(),
  /** Now, not for the range: Σ on hand × average cost. */
  inventoryValueSatang: z.number().int(),
  daily: z.array(dailySalesPointSchema),
  bestSellers: z.array(bestSellerSchema),
  unverifiedReceiptCount: z.number().int(),
  awaitingPriceCount: z.number().int(),
});

export type DashboardActivity = z.infer<typeof activitySchema>;
export type DashboardSummary = DashboardActivity &
  Partial<Omit<z.infer<typeof dashboardOwnerSchema>, keyof DashboardActivity>>;
