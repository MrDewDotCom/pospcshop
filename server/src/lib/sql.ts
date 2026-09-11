import { sql, type SQL, type AnyColumn } from 'drizzle-orm';

/** Escapes LIKE wildcards in user input so "50%" or "a_b" match literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `column LIKE '%text%'` with the input's wildcards escaped (case-insensitive for ASCII). */
export function contains(column: AnyColumn | SQL, text: string): SQL {
  return sql`${column} LIKE ${`%${escapeLike(text)}%`} ESCAPE '\\'`;
}
