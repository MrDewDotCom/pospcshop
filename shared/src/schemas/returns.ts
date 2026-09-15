import { z } from 'zod';
import { REFUND_METHODS, RESOLVED_RETURN_DISPOSITIONS, RETURN_DISPOSITIONS } from '../enums';
import { bangkokDateSchema, booleanQuerySchema, paginationQuerySchema } from './common';

// ---------- responses ----------
// Staff see the refund (they hand it over); only the cost of the returned units is owner-only.

const returnListItemBase = z.object({
  id: z.number().int(),
  docNo: z.string(),
  saleId: z.number().int(),
  saleDocNo: z.string(),
  returnedAt: z.string(),
  reason: z.string(),
  refundMethod: z.enum(REFUND_METHODS),
  refundSatang: z.number().int(),
  customerName: z.string(),
  customerPhone: z.string(),
  /** Units returned (Σ qty). */
  itemCount: z.number().int(),
  /** Units still in quarantine. */
  pendingCount: z.number().int(),
  createdByName: z.string().nullable(),
});
/** The list carries no cost, so both roles share it. */
export const returnListItemSchema = returnListItemBase;
export type ReturnListItem = z.infer<typeof returnListItemBase>;

const returnLineBase = z.object({
  id: z.number().int(),
  saleItemId: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  productSku: z.string(),
  qty: z.number().int(),
  serialItemId: z.number().int().nullable(),
  serialNo: z.string().nullable(),
  refundSatang: z.number().int(),
  disposition: z.enum(RETURN_DISPOSITIONS),
  resolvedAt: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  resolutionNote: z.string(),
});
const returnLineOwner = returnLineBase.extend({ unitCostSatang: z.number().int() });
export type ReturnLine = z.infer<typeof returnLineBase> & { unitCostSatang?: number };

const returnDetailBase = returnListItemBase.extend({
  saleSoldAt: z.string(),
  createdAt: z.string(),
  /** What the customer paid for the returned lines: the default refund and the most it can be. */
  maxRefundSatang: z.number().int(),
  refundAdjustedAt: z.string().nullable(),
  refundAdjustedByName: z.string().nullable(),
});
export const saleReturnStaffSchema = returnDetailBase.extend({ lines: z.array(returnLineBase) });
export const saleReturnOwnerSchema = returnDetailBase.extend({ lines: z.array(returnLineOwner) });
export type SaleReturn = z.infer<typeof returnDetailBase> & { lines: ReturnLine[] };

// ---------- inputs ----------

export const createReturnLineInputSchema = z.object({
  saleItemId: z.number().int().positive(),
  qty: z.number().int().min(1, { error: 'จำนวนต้องมากกว่า 0' }).max(1000),
  /** Serial-tracked lines: exactly which units came back (one per unit). */
  serialItemIds: z.array(z.number().int().positive()).max(1000).default([]),
});
export type CreateReturnLineInput = z.input<typeof createReturnLineInputSchema>;

/**
 * Record a return (staff or owner). No money field (P21): the refund is computed on the server from the
 * sale's snapshots, and only the owner can change it afterwards through its own endpoint.
 */
export const createReturnInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: 'กรุณาระบุเหตุผลที่คืนสินค้า' })
    .max(500, { error: 'เหตุผลยาวเกินไป' }),
  refundMethod: z.enum(REFUND_METHODS),
  lines: z
    .array(createReturnLineInputSchema)
    .min(1, { error: 'กรุณาเลือกสินค้าที่คืนอย่างน้อย 1 รายการ' })
    .max(200),
});
export type CreateReturnInput = z.input<typeof createReturnInputSchema>;

/** Owner only (P21). */
export const updateReturnRefundInputSchema = z.object({
  refundSatang: z.number().int().min(0, { error: 'จำนวนเงินต้องไม่ติดลบ' }).max(100_000_000_00),
});
export type UpdateReturnRefundInput = z.input<typeof updateReturnRefundInputSchema>;

export const resolveReturnItemInputSchema = z.object({
  disposition: z.enum(RESOLVED_RETURN_DISPOSITIONS),
  note: z.string().trim().max(500, { error: 'หมายเหตุยาวเกินไป' }).default(''),
});
export type ResolveReturnItemInput = z.input<typeof resolveReturnItemInputSchema>;

export const returnItemParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

export const listReturnsQuerySchema = paginationQuerySchema.extend({
  /** Matches the return number, the sale number, the customer, or a returned serial number. */
  q: z.string().trim().max(100).optional(),
  /** Only returns that still have units in quarantine. */
  pending: booleanQuerySchema,
  saleId: z.coerce.number().int().positive().optional(),
  from: bangkokDateSchema.optional(),
  to: bangkokDateSchema.optional(),
});
export type ListReturnsQuery = z.input<typeof listReturnsQuerySchema>;
export type ListReturnsFilters = z.output<typeof listReturnsQuerySchema>;
