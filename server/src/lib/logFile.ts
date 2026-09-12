// Server logs as one file per day inside the data directory's logs/ folder (PLAN.md §5). In development
// the log goes to the console instead; in production the shop has no console to watch — and from Phase 7
// (Electron) there is none at all — so a file is the only way to find out what happened last Tuesday.
//
// Pino has no built-in rotation, so we keep it simple: the file name carries the Bangkok date and old
// files are deleted on startup. A shop PC is restarted often enough for that to be plenty.

import fs from 'node:fs';
import path from 'node:path';
import { toBangkokParts } from '@pcshop/shared';

const FILE_PATTERN = /^server-(\d{4})-(\d{2})-(\d{2})\.log$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** e.g. "server-2026-09-12.log" for the Bangkok date of `now`. */
export function logFileName(now: number): string {
  const { year, month, day } = toBangkokParts(now);
  return `server-${year}-${pad(month)}-${pad(day)}.log`;
}

/**
 * Deletes log files older than `keepDays` whole days. Unknown files are left alone, and a file that
 * can't be deleted (open in an editor, say) must never stop the server from starting.
 */
export function pruneOldLogs(logsDir: string, keepDays: number, now = Date.now()): string[] {
  const cutoff = now - keepDays * DAY_MS;
  const removed: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(logsDir);
  } catch {
    return removed;
  }
  for (const name of names) {
    const match = FILE_PATTERN.exec(name);
    if (!match) continue;
    const [, year, month, day] = match;
    // Midnight Bangkok of that date, as UTC ms.
    const date = Date.UTC(Number(year), Number(month) - 1, Number(day)) - 7 * 60 * 60 * 1000;
    if (date >= cutoff) continue;
    try {
      fs.rmSync(path.join(logsDir, name));
      removed.push(name);
    } catch {
      // Ignore: a log we can't delete is not worth failing the startup for.
    }
  }
  return removed;
}

/** Today's log file, with old ones pruned. Returns the full path for Fastify's `logger.file`. */
export function openDailyLogFile(logsDir: string, keepDays = 14, now = Date.now()): string {
  pruneOldLogs(logsDir, keepDays, now);
  return path.join(logsDir, logFileName(now));
}
