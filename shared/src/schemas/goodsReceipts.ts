import { z } from 'zod';
import { COST_SOURCES, COST_STATUSES, GOODS_RECEIPT_STATUSES, SERIAL_STATUSES } from '../enums';
import { paginationQuerySchema } from './common';

// ---------- responses ----------
// Staff schemas have no cost fields at all: staff may type supplier costs, but never read them back.

const listItemBase = z.object({
  id: z.number().int(),
  docNo: z.string(),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().nullable(),
  supplierInvoiceNo: z.string(),
  receivedAt: z.string(),
  status: z.enum(GOODS_RECEIPT_STATUSES),
  costStatus: z.enum(COST_STATUSES),
  lineCount: z.number().int(),
  totalQty: z.number().int(),
  createdByName: z.string().nullable(),
});

export const goodsReceiptListItemStaffSchema = listItemBase;
export const goodsReceiptListItemOwnerSchema = listItemBase.extend({
  totalCostSatang: z.number().int(),
});
export type GoodsReceiptListItem = z.infer<typeof listItemBase> & { totalCostSatang?: number };

export const receivedSerialSchema = z.object({
  id: z.number().int(),
  serialNo: z.string(),
  status: z.enum(SERIAL_STATUSES),
});

const lineBase = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  productSku: z.string(),
  qty: z.number().int(),
  serials: z.array(receivedSerialSchema),
});
const lineOwner = lineBase.extend({
  unitCostSatang: z.number().int(),
  costSource: z.enum(COST_SOURCES),
  lineTotalSatang: z.number().int(),
});

const detailBase = listItemBase.extend({
  notes: z.string(),
  createdAt: z.string(),
  costVerifiedAt: z.string().nullable(),
  costVerifiedByName: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidedByName: z.string().nullable(),
  voidReason: z.string().nullable(),
});

export const goodsReceiptStaffSchema = detailBase.extend({ lines: z.array(lineBase) });
export const goodsReceiptOwnerSchema = detailBase.extend({
  totalCostSatang: z.number().int(),
  lines: z.array(lineOwner),
});
export type GoodsReceiptLine = z.infer<typeof lineBase> & Partial<z.infer<typeof lineOwner>>;
export type GoodsReceipt = z.infer<typeof detailBase> & {
  totalCostSatang?: number;
  lines: GoodsReceiptLine[];
};

// ---------- inputs ----------

export const MAX_RECEIPT_LINE_QTY = 10_000;

export const goodsReceiptLineInputSchema = z.object({
  productId: z.number().int().positive(),
  qty: z
    .number()
    .int()
    .min(1, { error: 'จำนวนต้องมากกว่า 0' })
    .max(MAX_RECEIPT_LINE_QTY, { error: 'จำนวนมากเกินไป' }),
  /** Supplier unit cost. Blank (null/omitted) → the product's current average cost is used. */
  unitCostSatang: z
    .number()
    .int()
    .min(0, { error: 'ต้นทุนต้องไม่ติดลบ' })
    .max(100_000_000_00)
    .nullable()
    .optional(),
  /** Required for serial-tracked products: one serial number per unit. */
  serials: z
    .array(z.string().trim().min(1).max(100, { error: 'ซีเรียลยาวเกินไป' }))
    .max(MAX_RECEIPT_LINE_QTY)
    .default([]),
});
export type GoodsReceiptLineInput = z.input<typeof goodsReceiptLineInputSchema>;

export const createGoodsReceiptInputSchema = z.object({
  supplierId: z.number().int().positive().nullable().optional(),
  supplierInvoiceNo: z.string().trim().max(60, { error: 'เลขที่บิลยาวเกินไป' }).default(''),
  notes: z.string().trim().max(1000, { error: 'หมายเหตุยาวเกินไป' }).default(''),
  lines: z
    .array(goodsReceiptLineInputSchema)
    .min(1, { error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' })
    .max(200, { error: 'รับสินค้าได้ไม่เกิน 200 รายการต่อใบ' }),
});
export type CreateGoodsReceiptInput = z.input<typeof createGoodsReceiptInputSchema>;

export const listGoodsReceiptsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  status: z.enum(GOODS_RECEIPT_STATUSES).optional(),
  /** Staff may filter by it too: they see that a receipt awaits review, never the values. */
  costStatus: z.enum(COST_STATUSES).optional(),
});
export type ListGoodsReceiptsQuery = z.input<typeof listGoodsReceiptsQuerySchema>;
export type ListGoodsReceiptsFilters = z.output<typeof listGoodsReceiptsQuerySchema>;
