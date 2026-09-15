import { z } from 'zod';

/** `?page=&pageSize=` query parameters (query strings are text, so values are coerced). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.output<typeof paginationQuerySchema>;

/** Every list endpoint returns this shape. */
export interface Paginated<T> {
  items: T[];
  total: number;
}

/** `/:id` route parameter. */
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Voiding any financial document requires a reason (it goes into the document and the audit log). */
export const voidInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: 'กรุณาระบุเหตุผลที่ยกเลิก' })
    .max(500, { error: 'เหตุผลยาวเกินไป' }),
});
export type VoidInput = z.input<typeof voidInputSchema>;

/** ISO-8601 UTC timestamp as sent by the API (the DB stores epoch milliseconds). */
export const isoDateTimeSchema = z.string();

/** Bangkok calendar date "YYYY-MM-DD" (C.E.), used by inclusive `from`/`to` range filters. */
export const bangkokDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'รูปแบบวันที่ไม่ถูกต้อง' });

/** `?flag=true|false` query parameter → boolean (absent = false). */
export const booleanQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');
