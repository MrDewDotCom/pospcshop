import { z } from 'zod';
import { CATEGORY_KINDS, PRODUCT_CONDITIONS, WARRANTY_TYPES } from '../enums';
import { paginationQuerySchema } from './common';
import { autoTagSchema, productTagChipSchema } from './tags';

// ---------- responses ----------

export const productImageSchema = z.object({
  fileId: z.number().int(),
  url: z.string(),
  thumbUrl: z.string(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

/** Fields everyone may see. The owner schema adds cost. */
const productListItemBase = z.object({
  id: z.number().int(),
  sku: z.string(),
  barcode: z.string().nullable(),
  name: z.string(),
  brand: z.string(),
  categoryId: z.number().int(),
  categoryName: z.string(),
  categoryKind: z.enum(CATEGORY_KINDS),
  condition: z.enum(PRODUCT_CONDITIONS),
  warrantyType: z.enum(WARRANTY_TYPES),
  warrantyMonths: z.number().int(),
  priceSatang: z.number().int().nullable(),
  regularPriceSatang: z.number().int().nullable(),
  trackStock: z.boolean(),
  serialRequired: z.boolean(),
  minStock: z.number().int(),
  onHand: z.number().int(),
  specs: z.record(z.string(), z.unknown()),
  thumbUrl: z.string().nullable(),
  archivedAt: z.string().nullable(),
  /** Owner-defined tags (archived tags are left out). */
  tags: z.array(productTagChipSchema),
  /** Derived by `deriveAutoTags` (shared/tags.ts); never stored. */
  autoTags: z.array(autoTagSchema),
});

export const productListItemStaffSchema = productListItemBase;
export const productListItemOwnerSchema = productListItemBase.extend({
  costSatang: z.number().int(),
});
export type ProductListItem = z.infer<typeof productListItemStaffSchema> & { costSatang?: number };

const productDetailBase = productListItemBase.extend({
  description: z.string(),
  supplierWarrantyMonths: z.number().int(),
  notes: z.string(),
  images: z.array(productImageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const productStaffSchema = productDetailBase;
export const productOwnerSchema = productDetailBase.extend({ costSatang: z.number().int() });
export type Product = z.infer<typeof productStaffSchema> & { costSatang?: number };

export interface PriceHistoryEntry {
  id: number;
  changedAt: string;
  priceSatang: number | null;
  regularPriceSatang: number | null;
  changedByName: string | null;
}

export type LookupMatch = 'barcode' | 'sku' | 'serial';

export interface ProductLookupResponse {
  product: ProductListItem;
  matchedBy: LookupMatch;
  /** The code that matched (after Thai-layout correction, if it was needed). */
  code: string;
  serialItemId?: number;
}

// ---------- inputs ----------

const monthsSchema = z
  .number()
  .int()
  .min(0, { error: 'ต้องไม่ติดลบ' })
  .max(120, { error: 'ไม่เกิน 120 เดือน' });

/** Fields only the owner may change after creation (staff may set them once, when creating). */
export const productCoreFieldsSchema = z.object({
  /** Blank → generated from the category, e.g. "CPU-0007". */
  sku: z
    .string()
    .trim()
    .max(40, { error: 'รหัสสินค้ายาวเกินไป' })
    .regex(/^[A-Za-z0-9._/-]*$/, { error: 'รหัสสินค้าใช้ได้เฉพาะ A-Z, 0-9 และ . _ / -' }),
  /** Blank → no barcode. Codes typed with the Thai keyboard layout are corrected on the server. */
  barcode: z.string().trim().max(64, { error: 'บาร์โค้ดยาวเกินไป' }),
  name: z
    .string()
    .trim()
    .min(1, { error: 'กรุณากรอกชื่อสินค้า' })
    .max(200, { error: 'ชื่อสินค้ายาวเกินไป' }),
  brand: z.string().trim().max(80, { error: 'ยี่ห้อยาวเกินไป' }),
  categoryId: z.number({ error: 'กรุณาเลือกหมวดหมู่' }).int().positive(),
  condition: z.enum(PRODUCT_CONDITIONS),
  warrantyType: z.enum(WARRANTY_TYPES),
  warrantyMonths: monthsSchema,
  supplierWarrantyMonths: monthsSchema,
  trackStock: z.boolean(),
  serialRequired: z.boolean(),
  minStock: z.number().int().min(0, { error: 'ต้องไม่ติดลบ' }).max(100_000),
  notes: z.string().trim().max(1000, { error: 'หมายเหตุยาวเกินไป' }),
});

/** Fields staff may always edit (Q7): details and specs. Images have their own endpoint. */
export const productDetailFieldsSchema = z.object({
  description: z.string().trim().max(5000, { error: 'คำอธิบายยาวเกินไป' }),
  /** Validated against the category's spec definition on the server. */
  specs: z.record(z.string(), z.unknown()),
});

export const STAFF_EDITABLE_PRODUCT_FIELDS = ['description', 'specs'] as const;

export const productPricingInputSchema = z.object({
  priceSatang: z.number().int().min(0, { error: 'ราคาต้องไม่ติดลบ' }).max(100_000_000_00),
  /** Omit for the automatic rule; null clears it; a number sets it explicitly. */
  regularPriceSatang: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  /** Manual cost override (normally cost comes from goods receipts). Owner only. */
  costSatang: z.number().int().min(0).max(100_000_000_00).optional(),
});
export type ProductPricingInput = z.input<typeof productPricingInputSchema>;

export const createProductInputSchema = productCoreFieldsSchema.extend({
  ...productDetailFieldsSchema.shape,
  imageFileIds: z.array(z.number().int().positive()).max(12).default([]),
  /** Owner only: set prices while creating. Staff-created products start as "awaiting price". */
  pricing: productPricingInputSchema.optional(),
});
export type CreateProductInput = z.input<typeof createProductInputSchema>;

/** Strict: money fields are rejected here; they only change through the pricing endpoint. */
export const updateProductInputSchema = productCoreFieldsSchema
  .extend(productDetailFieldsSchema.shape)
  .partial()
  .strict();
export type UpdateProductInput = z.input<typeof updateProductInputSchema>;

export const setProductImagesInputSchema = z.object({
  fileIds: z.array(z.number().int().positive()).max(12),
});

export const PRODUCT_STOCK_FILTERS = ['in', 'out', 'low'] as const;
export const PRODUCT_SORTS = ['name', 'newest', 'price', 'stock'] as const;
export const PRODUCT_STATUS_FILTERS = ['active', 'archived', 'awaitingPrice'] as const;

export const listProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  tagId: z.coerce.number().int().positive().optional(),
  condition: z.enum(PRODUCT_CONDITIONS).optional(),
  stock: z.enum(PRODUCT_STOCK_FILTERS).optional(),
  discounted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  status: z.enum(PRODUCT_STATUS_FILTERS).default('active'),
  sort: z.enum(PRODUCT_SORTS).default('name'),
});
export type ListProductsQuery = z.input<typeof listProductsQuerySchema>;
/** The query after validation (what the route handler receives). */
export type ListProductsFilters = z.output<typeof listProductsQuerySchema>;

export const lookupQuerySchema = z.object({
  code: z.string().trim().min(1).max(100),
});
