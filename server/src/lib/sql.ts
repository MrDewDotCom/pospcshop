import { sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { bangkokDateKeyToMs } from '@pcshop/shared';

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
