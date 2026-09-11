// Time helpers. Timestamps are stored as UTC epoch milliseconds and displayed in Thai time.
// Thailand is a fixed UTC+7 with no daylight saving, so a constant offset is exact.
// Formatting is done by hand (not Intl) so the output is identical on the server and in every browser.

export const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUDDHIST_ERA_OFFSET = 543;

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

export const THAI_MONTHS_LONG = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

export interface BangkokParts {
  /** Gregorian (C.E.) year */
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Splits a UTC timestamp into its Thai-time calendar parts. */
export function toBangkokParts(ms: number): BangkokParts {
  const shifted = new Date(ms + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** UTC timestamp of a Thai-time wall-clock moment (month is 1–12). */
export function fromBangkokParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - BANGKOK_OFFSET_MS;
}

/**
 * Adds calendar months in Thai time, keeping the wall-clock time. The day is clamped to the end of the
 * target month (31 Jan + 1 month → 28/29 Feb), e.g. for warranty expiry dates.
 */
export function addBangkokMonths(ms: number, months: number): number {
  const p = toBangkokParts(ms);
  const index = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return fromBangkokParts(year, month, Math.min(p.day, lastDay), p.hour, p.minute, p.second);
}

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BUDDHIST_ERA_OFFSET;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Thai-date key "YYYY-MM-DD" (C.E.), used for grouping sales by day. */
export function bangkokDateKey(ms: number): string {
  const p = toBangkokParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export interface TimeRange {
  /** inclusive */
  startMs: number;
  /** exclusive */
  endMs: number;
}

/** The Thai calendar day containing `ms` (00:00 Bangkok up to the next 00:00). */
export function bangkokDayRange(ms: number): TimeRange {
  const p = toBangkokParts(ms);
  const startMs = fromBangkokParts(p.year, p.month, p.day);
  return { startMs, endMs: startMs + DAY_MS };
}

/** The Thai calendar month containing `ms`. */
export function bangkokMonthRange(ms: number): TimeRange {
  const p = toBangkokParts(ms);
  return {
    startMs: fromBangkokParts(p.year, p.month, 1),
    endMs: fromBangkokParts(
      p.month === 12 ? p.year + 1 : p.year,
      p.month === 12 ? 1 : p.month + 1,
      1,
    ),
  };
}

export interface ThaiDateOptions {
  /** Show the year in the Buddhist Era (พ.ศ.). Default true (the shop setting decides in practice). */
  buddhistEra?: boolean;
  /** "short" → 10 ก.ย. 2569, "long" → 10 กันยายน 2569, "numeric" → 10/09/2569. Default "short". */
  month?: 'short' | 'long' | 'numeric';
}

/** Formats the Thai-time date of a timestamp. */
export function formatThaiDate(ms: number, options: ThaiDateOptions = {}): string {
  const { buddhistEra = true, month = 'short' } = options;
  const p = toBangkokParts(ms);
  const year = buddhistEra ? toBuddhistYear(p.year) : p.year;
  if (month === 'numeric') return `${pad2(p.day)}/${pad2(p.month)}/${year}`;
  const monthName = (month === 'long' ? THAI_MONTHS_LONG : THAI_MONTHS_SHORT)[p.month - 1];
  return `${p.day} ${monthName} ${year}`;
}

/** "14:05" in Thai time. */
export function formatThaiTime(ms: number): string {
  const p = toBangkokParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "10 ก.ย. 2569 14:05" in Thai time. */
export function formatThaiDateTime(ms: number, options: ThaiDateOptions = {}): string {
  return `${formatThaiDate(ms, options)} ${formatThaiTime(ms)}`;
}
