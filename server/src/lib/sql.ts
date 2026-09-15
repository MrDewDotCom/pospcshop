import { getTableName, sql, type AnyColumn, type Column, type SQL } from 'drizzle-orm';
import { bangkokDateKeyToMs } from '@pcshop/shared';

/**
 * The outer row's column in a correlated subquery, always written as "table"."column". Drizzle leaves
 * columns unqualified in the SELECT list of a single-table query, so `${customers.id}` inside a subquery
 * over `sales` would render as a bare "id" and silently bind to sales.id. Use this for every reference
 * from a subquery to the row outside it.
 */
export function outer(column: Column): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filters for an inclusive range of Bangkok dates ("YYYY-MM-DD") on an epoch-ms column. */
export function bangkokDateFilters(column: AnyColumn | SQL, from?: string, to?: string): SQL[] {
  return [
    ...(from ? [sql`${column} >= ${bangkokDateKeyToMs(from)}`] : []),
    ...(to ? [sql`${column} < ${bangkokDateKeyToMs(to) + DAY_MS}`] : []),
  ];
}

/** Escapes LIKE wildcards in user input so "50%" or "a_b" match literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `column LIKE '%text%'` with the input's wildcards escaped (case-insensitive for ASCII). */
export function contains(column: AnyColumn | SQL, text: string): SQL {
  return sql`${column} LIKE ${`%${escapeLike(text)}%`} ESCAPE '\\'`;
}
