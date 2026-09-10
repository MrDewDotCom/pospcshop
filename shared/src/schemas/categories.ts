import { z } from 'zod';
import { CATEGORY_KINDS } from '../enums';

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  kind: z.enum(CATEGORY_KINDS),
  sortOrder: z.number().int(),
  isSystem: z.boolean(),
  archivedAt: z.string().nullable(),
  /** Active (non-archived) products in this category. */
  productCount: z.number().int(),
});
export type Category = z.infer<typeof categorySchema>;

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'กรุณากรอกชื่อหมวดหมู่' })
  .max(60, { error: 'ชื่อหมวดหมู่ยาวเกินไป' });

export const createCategoryInputSchema = z.object({
  name: categoryNameSchema,
  kind: z.enum(CATEGORY_KINDS),
});
export type CreateCategoryInput = z.input<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = createCategoryInputSchema.partial();
export type UpdateCategoryInput = z.input<typeof updateCategoryInputSchema>;

export const reorderCategoriesInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export const listCategoriesQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
