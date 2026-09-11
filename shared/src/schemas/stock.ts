import { z } from 'zod';
import { SERIAL_STATUSES, STOCK_MOVEMENT_TYPES } from '../enums';
import { paginationQuerySchema } from './common';

// ---------- movements (ledger) ----------

const movementBase = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  productSku: z.string(),
  qtyChange: z.number().int(),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  refType: z.string().nullable(),
  refId: z.number().int().nullable(),
  refDocNo: z.string().nullable(),
  balanceAfter: z.number().int(),
  reason: z.string().nullable(),
  performedByName: z.string().nullable(),
  createdAt: z.string(),
  serialNos: z.array(z.string()),
});
export const stockMovementStaffSchema = movementBase;
export const stockMovementOwnerSchema = movementBase.extend({
  unitCostSatang: z.number().int().nullable(),
});
export type StockMovement = z.infer<typeof movementBase> & { unitCostSatang?: number | null };

/** Bangkok calendar date "YYYY-MM-DD" (inclusive range filters). */
const bangkokDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'รูปแบบวันที่ไม่ถูกต้อง' });

export const listStockMovementsQuerySchema = paginationQuerySchema.extend({
  productId: z.coerce.number().int().positive().optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  /** Matches the document number. */
  q: z.string().trim().max(60).optional(),
  from: bangkokDateSchema.optional(),
  to: bangkokDateSchema.optional(),
});
export type ListStockMovementsQuery = z.input<typeof listStockMovementsQuerySchema>;
export type ListStockMovementsFilters = z.output<typeof listStockMovementsQuerySchema>;

// ---------- serial units ----------

const serialBase = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  productSku: z.string(),
  serialNo: z.string(),
  status: z.enum(SERIAL_STATUSES),
  wasReturned: z.boolean(),
  receivedAt: z.string(),
  supplierWarrantyExpiresAt: z.string().nullable(),
  notes: z.string(),
});
export const serialItemStaffSchema = serialBase;
export const serialItemOwnerSchema = serialBase.extend({ unitCostSatang: z.number().int() });
export type SerialItem = z.infer<typeof serialBase> & { unitCostSatang?: number };

export const listSerialsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(SERIAL_STATUSES).optional(),
});
export type ListSerialsQuery = z.input<typeof listSerialsQuerySchema>;
export type ListSerialsFilters = z.output<typeof listSerialsQuerySchema>;

// ---------- adjustments (owner) ----------

export const MAX_ADJUSTMENT_QTY = 10_000;

export const stockAdjustmentLineSchema = z.object({
  productId: z.number().int().positive(),
  /** + found/added stock, − missing/damaged stock. */
  qtyChange: z
    .number()
    .int()
    .min(-MAX_ADJUSTMENT_QTY)
    .max(MAX_ADJUSTMENT_QTY)
    .refine((n) => n !== 0, { error: 'จำนวนที่ปรับต้องไม่เป็น 0' }),
  /** Adding serial-tracked stock: the serial numbers of the new units. */
  serials: z.array(z.string().trim().min(1).max(100)).max(MAX_ADJUSTMENT_QTY).default([]),
  /** Removing serial-tracked stock: which units (they become "written off"). */
  serialIds: z.array(z.number().int().positive()).max(MAX_ADJUSTMENT_QTY).default([]),
  /** Adding stock only: the cost of the added units (moves the average). Blank = current average. */
  unitCostSatang: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
});
export type StockAdjustmentLine = z.input<typeof stockAdjustmentLineSchema>;

export const stockAdjustmentInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: 'กรุณาระบุเหตุผลที่ปรับสต็อก' })
    .max(500, { error: 'เหตุผลยาวเกินไป' }),
  lines: z
    .array(stockAdjustmentLineSchema)
    .min(1, { error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' })
    .max(100),
});
export type StockAdjustmentInput = z.input<typeof stockAdjustmentInputSchema>;

export interface StockAdjustmentResult {
  docNo: string;
  lines: { productId: number; productName: string; qtyChange: number; balanceAfter: number }[];
}

// ---------- integrity (owner) ----------

export interface StockIntegrityReport {
  ok: boolean;
  checkedAt: string;
  productCount: number;
  mismatches: {
    productId: number;
    sku: string;
    name: string;
    onHand: number;
    ledgerSum: number;
    inStockSerials: number | null;
  }[];
}
