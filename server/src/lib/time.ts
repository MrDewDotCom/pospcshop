/** DB timestamps are epoch milliseconds; the API sends ISO-8601 UTC strings. */
export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function toIsoOrNull(ms: number | null | undefined): string | null {
  return ms == null ? null : toIso(ms);
}
