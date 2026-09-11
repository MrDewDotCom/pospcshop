import { z } from 'zod';
import { AUTO_TAG_KEYS, AUTO_TAG_TONES, TAG_COLORS } from '../tags';

export const tagSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.enum(TAG_COLORS),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  /** Active (non-archived) products that carry this tag. */
  productCount: z.number().int(),
});
export type Tag = z.infer<typeof tagSchema>;

/** A custom tag as shown on a product. Archived tags are left out. */
export const productTagChipSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.enum(TAG_COLORS),
});
export type ProductTagChip = z.infer<typeof productTagChipSchema>;

export const autoTagSchema = z.object({
  key: z.enum(AUTO_TAG_KEYS),
  label: z.string(),
  tone: z.enum(AUTO_TAG_TONES),
});

const tagNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'กรุณากรอกชื่อแท็ก' })
  .max(30, { error: 'ชื่อแท็กยาวเกินไป (ไม่เกิน 30 ตัวอักษร)' });

export const createTagInputSchema = z.object({
  name: tagNameSchema,
  color: z.enum(TAG_COLORS, { error: 'กรุณาเลือกสี' }),
});
export type CreateTagInput = z.input<typeof createTagInputSchema>;

export const updateTagInputSchema = createTagInputSchema.partial();
export type UpdateTagInput = z.input<typeof updateTagInputSchema>;

export const reorderTagsInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export const listTagsQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const setProductTagsInputSchema = z.object({
  tagIds: z.array(z.number().int().positive()).max(20, { error: 'ติดแท็กได้ไม่เกิน 20 แท็ก' }),
});
export type SetProductTagsInput = z.input<typeof setProductTagsInputSchema>;
