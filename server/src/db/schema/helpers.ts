import { sql } from 'drizzle-orm';
import { check, integer } from 'drizzle-orm/sqlite-core';

// Timestamps are UTC epoch milliseconds (plain numbers), matching shared/datetime.ts.
export const createdAt = () =>
  integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now());

export const updatedAt = () =>
  integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now());

/**
 * Drizzle's `text({ enum })` only narrows the TypeScript type, so every enum column also gets a real
 * CHECK constraint. Values come from shared/enums.ts (trusted constants), so inlining them is safe.
 */
export function enumCheck(table: string, column: string, values: readonly string[]) {
  const list = values.map((value) => `'${value}'`).join(', ');
  return check(`${table}_${column}_check`, sql.raw(`"${column}" IN (${list})`));
}

/**
 * Marks a row as sample data created by the seed (PLAN.md Q10), so "clear sample data" can find and
 * remove exactly those rows and nothing the shop entered itself.
 */
export const isSample = () => integer('is_sample', { mode: 'boolean' }).notNull().default(false);

/** CHECK that a numeric column is >= 0 (NULL is allowed for nullable columns). */
export function nonNegativeCheck(table: string, column: string) {
  return check(`${table}_${column}_non_negative`, sql.raw(`"${column}" >= 0`));
}
