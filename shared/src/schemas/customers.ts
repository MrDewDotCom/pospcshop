import { z } from 'zod';
import { booleanQuerySchema, paginationQuerySchema } from './common';
import { returnListItemSchema } from './returns';
import { saleListItemOwnerSchema, saleListItemStaffSchema } from './sales';

// ---------- responses ----------

export const customerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string(),
  lineId: z.string(),
  address: z.string(),
  notes: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Activity only: the list carries no money, so staff and owner share it. */
export const customerListItemSchema = customerSchema.extend({
  saleCount: z.number().int(),
  lastSaleAt: z.string().nullable(),
});
export type CustomerListItem = z.infer<typeof customerListItemSchema>;

/** Other customers with the same phone number (a warning, never a block: families share phones). */
export const customerPhoneMatchSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string(),
  archivedAt: z.string().nullable(),
});
export type CustomerPhoneMatch = z.infer<typeof customerPhoneMatchSchema>;

/** Purchases and returns (devices and repairs join in Phases 3 and 5). */
export const customerHistoryStaffSchema = z.object({
  sales: z.array(saleListItemStaffSchema),
  returns: z.array(returnListItemSchema),
});
export const customerHistoryOwnerSchema = customerHistoryStaffSchema.extend({
  sales: z.array(saleListItemOwnerSchema),
});
export type CustomerHistory = z.infer<typeof customerHistoryStaffSchema> & {
  sales: (z.infer<typeof saleListItemStaffSchema> & {
    totalCostSatang?: number;
    profitSatang?: number;
  })[];
};

// ---------- inputs ----------

const customerFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: 'กรุณากรอกชื่อลูกค้า' })
    .max(120, { error: 'ชื่อยาวเกินไป' }),
  phone: z.string().trim().max(40, { error: 'เบอร์โทรยาวเกินไป' }),
  lineId: z.string().trim().max(60, { error: 'LINE ID ยาวเกินไป' }),
  address: z.string().trim().max(500, { error: 'ที่อยู่ยาวเกินไป' }),
  notes: z.string().trim().max(1000, { error: 'หมายเหตุยาวเกินไป' }),
};

export const customerInputSchema = z.object({
  ...customerFields,
  phone: customerFields.phone.default(''),
  lineId: customerFields.lineId.default(''),
  address: customerFields.address.default(''),
  notes: customerFields.notes.default(''),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

/** No defaults here: `.partial()` would still apply them and blank out fields that weren't sent. */
export const updateCustomerInputSchema = z.object(customerFields).partial();
export type UpdateCustomerInput = z.input<typeof updateCustomerInputSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  /** Name or phone (any formatting: "081-234", "0812", "+66 81…"). */
  q: z.string().trim().max(100).optional(),
  includeArchived: booleanQuerySchema,
});
export type ListCustomersQuery = z.input<typeof listCustomersQuerySchema>;
export type ListCustomersFilters = z.output<typeof listCustomersQuerySchema>;

export const customerPhoneMatchQuerySchema = z.object({
  phone: z.string().trim().min(1).max(40),
  /** Leave out the customer being edited. */
  excludeId: z.coerce.number().int().positive().optional(),
});
