import { z } from 'zod';
import { paginationQuerySchema } from './common';

export const supplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  contactName: z.string(),
  phone: z.string(),
  lineId: z.string(),
  address: z.string(),
  notes: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Supplier = z.infer<typeof supplierSchema>;

const supplierFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: 'กรุณากรอกชื่อผู้จำหน่าย' })
    .max(120, { error: 'ชื่อยาวเกินไป' }),
  contactName: z.string().trim().max(80, { error: 'ชื่อผู้ติดต่อยาวเกินไป' }),
  phone: z.string().trim().max(40, { error: 'เบอร์โทรยาวเกินไป' }),
  lineId: z.string().trim().max(60, { error: 'LINE ID ยาวเกินไป' }),
  address: z.string().trim().max(500, { error: 'ที่อยู่ยาวเกินไป' }),
  notes: z.string().trim().max(1000, { error: 'หมายเหตุยาวเกินไป' }),
};

export const supplierInputSchema = z.object({
  ...supplierFields,
  contactName: supplierFields.contactName.default(''),
  phone: supplierFields.phone.default(''),
  lineId: supplierFields.lineId.default(''),
  address: supplierFields.address.default(''),
  notes: supplierFields.notes.default(''),
});
export type SupplierInput = z.input<typeof supplierInputSchema>;

/** No defaults here: `.partial()` would still apply them and blank out fields that weren't sent. */
export const updateSupplierInputSchema = z.object(supplierFields).partial();
export type UpdateSupplierInput = z.input<typeof updateSupplierInputSchema>;

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListSuppliersQuery = z.input<typeof listSuppliersQuerySchema>;
