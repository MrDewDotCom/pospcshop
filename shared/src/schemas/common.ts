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

/** ISO-8601 UTC timestamp as sent by the API (the DB stores epoch milliseconds). */
export const isoDateTimeSchema = z.string();
