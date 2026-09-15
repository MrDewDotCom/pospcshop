import { z } from 'zod';
import {
  CHECKOUT_PAYMENT_METHODS,
  PAYMENT_METHODS,
  REFUND_METHODS,
  SALE_ITEM_KINDS,
  SALE_SOURCES,
  SALE_STATUSES,
  WARRANTY_TYPES,
} from '../enums';
import { bangkokDateSchema, booleanQuerySchema, paginationQuerySchema } from './common';

// ---------- responses ----------
// Staff see what the customer paid (they rang it up), never cost or profit. The owner schemas add those.

const saleListItemBase = z.object({
  id: z.number().int(),
  docNo: z.string(),
  soldAt: z.string(),
  status: z.enum(SALE_STATUSES),
  source: z.enum(SALE_SOURCES),
  customerId: z.number().int().nullable(),
  /** Snapshots taken at checkout (Q14); blank for a walk-in customer. */
  customerName: z.string(),
  customerPhone: z.string(),
  totalSatang: z.number().int(),
  savingsSatang: z.number().int(),
  refundedSatang: z.number().int(),
  /** Units sold (Σ qty). */
  itemCount: z.number().int(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  salespersonId: z.number().int().nullable(),
  salespersonName: z.string().nullable(),
  returnCount: z.number().int(),
});

const saleMoneyOwner = {
  totalCostSatang: z.number().int(),
  /** Net of returns: (total − refunds) − (cost − returned cost). */
  profitSatang: z.number().int(),
};

export const saleListItemStaffSchema = saleListItemBase;
export const saleListItemOwnerSchema = saleListItemBase.extend(saleMoneyOwner);
export type SaleListItem = z.infer<typeof saleListItemBase> & {
  totalCostSatang?: number;
  profitSatang?: number;
};

export const saleSerialSchema = z.object({
  id: z.number().int(),
  serialNo: z.string(),
  /** This unit came back on one of the sale's returns. */
  returned: z.boolean(),
  /** Shop warranty end for this unit (from the line's warranty snapshot). */
  warrantyExpiresAt: z.string().nullable(),
});
export type SaleSerial = z.infer<typeof saleSerialSchema>;

const saleLineBase = z.object({
  id: z.number().int(),
  kind: z.enum(SALE_ITEM_KINDS),
  parentItemId: z.number().int().nullable(),
  productId: z.number().int().nullable(),
  name: z.string(),
  sku: z.string(),
  qty: z.number().int(),
  unitPriceSatang: z.number().int(),
  regularPriceSatang: z.number().int().nullable(),
  lineTotalSatang: z.number().int(),
  warrantyType: z.enum(WARRANTY_TYPES),
  warrantyMonths: z.number().int(),
  returnedQty: z.number().int(),
  serialRequired: z.boolean(),
  serials: z.array(saleSerialSchema),
});
const saleLineOwner = saleLineBase.extend({ unitCostSatang: z.number().int() });
export type SaleLine = z.infer<typeof saleLineBase> & { unitCostSatang?: number };

export const salePaymentSchema = z.object({
  id: z.number().int(),
  method: z.enum(PAYMENT_METHODS),
  amountSatang: z.number().int(),
  receivedSatang: z.number().int(),
  changeSatang: z.number().int(),
  paidAt: z.string(),
  receivedByName: z.string().nullable(),
  voidedAt: z.string().nullable(),
});
export type SalePayment = z.infer<typeof salePaymentSchema>;

export const saleReturnSummarySchema = z.object({
  id: z.number().int(),
  docNo: z.string(),
  returnedAt: z.string(),
  refundMethod: z.enum(REFUND_METHODS),
  refundSatang: z.number().int(),
  itemCount: z.number().int(),
});
export type SaleReturnSummary = z.infer<typeof saleReturnSummarySchema>;

const saleDetailBase = saleListItemBase.extend({
  note: z.string(),
  createdAt: z.string(),
  voidedAt: z.string().nullable(),
  voidedByName: z.string().nullable(),
  voidReason: z.string().nullable(),
  payment: salePaymentSchema.nullable(),
  returns: z.array(saleReturnSummarySchema),
});

/** Everything the receipt needs (the shop header comes from GET /settings). */
export const saleStaffSchema = saleDetailBase.extend({ lines: z.array(saleLineBase) });
export const saleOwnerSchema = saleDetailBase.extend({
  ...saleMoneyOwner,
  lines: z.array(saleLineOwner),
});
export type Sale = z.infer<typeof saleDetailBase> & {
  totalCostSatang?: number;
  profitSatang?: number;
  lines: SaleLine[];
};

// ---------- inputs ----------

export const MAX_SALE_LINE_QTY = 1000;
const MAX_AMOUNT_SATANG = 100_000_000_00;

export const checkoutLineInputSchema = z.object({
  productId: z.number().int().positive(),
  qty: z
    .number()
    .int()
    .min(1, { error: 'จำนวนต้องมากกว่า 0' })
    .max(MAX_SALE_LINE_QTY, { error: 'จำนวนมากเกินไป' }),
  /** Serial-tracked products: exactly `qty` units that are in stock. */
  serialItemIds: z.array(z.number().int().positive()).max(MAX_SALE_LINE_QTY).default([]),
});
export type CheckoutLineInput = z.input<typeof checkoutLineInputSchema>;

export const checkoutPaymentInputSchema = z.object({
  method: z.enum(CHECKOUT_PAYMENT_METHODS),
  /** What the user typed as received (Q9): cash ≥ total, transfer = total. */
  receivedSatang: z
    .number()
    .int()
    .min(0, { error: 'จำนวนเงินต้องไม่ติดลบ' })
    .max(MAX_AMOUNT_SATANG, { error: 'จำนวนเงินมากเกินไป' }),
});
export type CheckoutPaymentInput = z.input<typeof checkoutPaymentInputSchema>;

/**
 * Confirm checkout. Prices always come from the product records on the server; staff never send one.
 * `expectedTotalSatang` is the total the cashier saw: if a price changed in the meantime the server
 * refuses with PRICE_CHANGED instead of charging a different amount than the one on screen.
 */
export const checkoutInputSchema = z.object({
  items: z
    .array(checkoutLineInputSchema)
    .min(1, { error: 'ยังไม่มีสินค้าในตะกร้า' })
    .max(200, { error: 'ขายได้ไม่เกิน 200 รายการต่อบิล' }),
  customerId: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500, { error: 'หมายเหตุยาวเกินไป' }).default(''),
  payment: checkoutPaymentInputSchema,
  expectedTotalSatang: z.number().int().min(0).max(MAX_AMOUNT_SATANG),
});
export type CheckoutInput = z.input<typeof checkoutInputSchema>;

export const listSalesQuerySchema = paginationQuerySchema.extend({
  /** Matches the document number, customer name/phone, or a serial number sold on the bill. */
  q: z.string().trim().max(100).optional(),
  from: bangkokDateSchema.optional(),
  to: bangkokDateSchema.optional(),
  status: z.enum(SALE_STATUSES).optional(),
  paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  /** Only sales rung up by the current user. */
  mine: booleanQuerySchema,
});
export type ListSalesQuery = z.input<typeof listSalesQuerySchema>;
export type ListSalesFilters = z.output<typeof listSalesQuerySchema>;
