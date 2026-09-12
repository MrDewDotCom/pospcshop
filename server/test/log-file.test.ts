// Daily server log files in the data directory (PLAN.md §5): today's name, and old files pruned.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fromBangkokParts } from '@pcshop/shared';
import { logFileName, openDailyLogFile, pruneOldLogs } from '../src/lib/logFile';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcshop-logs-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const at = (year: number, month: number, day: number, hour = 12) =>
  fromBangkokParts(year, month, day, hour);

const touch = (name: string) => fs.writeFileSync(path.join(dir, name), 'x');
const names = () => fs.readdirSync(dir).sort();

describe('daily log file', () => {
  it('names the file after the Bangkok date, not the UTC date', () => {
    // 23:30 Bangkok on the 12th is still the 12th here, though it is the 11th in UTC.
    expect(logFileName(at(2026, 9, 12, 23))).toBe('server-2026-09-12.log');
    expect(logFileName(at(2026, 1, 5, 0))).toBe('server-2026-01-05.log');
  });

  it('deletes only log files older than the keep window', () => {
    const now = at(2026, 9, 12);
    touch('server-2026-09-12.log'); // today
    touch('server-2026-09-01.log'); // 11 days old
    touch('server-2026-08-20.log'); // 23 days old
    touch('server-2026-07-04.log'); // ancient
    touch('notes.txt'); // not ours

    const removed = pruneOldLogs(dir, 14, now);
    expect(removed.sort()).toEqual(['server-2026-07-04.log', 'server-2026-08-20.log']);
    expect(names()).toEqual(['notes.txt', 'server-2026-09-01.log', 'server-2026-09-12.log']);
  });

  it('returns today’s path and survives a missing folder', () => {
    const now = at(2026, 9, 12);
    expect(openDailyLogFile(dir, 14, now)).toBe(path.join(dir, 'server-2026-09-12.log'));
    expect(pruneOldLogs(path.join(dir, 'nope'), 14, now)).toEqual([]);
  });
});
