import { describe, expect, it } from 'vitest';
import {
  addBangkokMonths,
  bangkokDateKey,
  bangkokDayRange,
  bangkokMonthRange,
  formatThaiDate,
  formatThaiDateTime,
  formatThaiTime,
  fromBangkokParts,
  toBangkokParts,
} from './datetime';

// 2026-09-10 16:30 UTC = 2026-09-10 23:30 in Bangkok
const lateEvening = Date.UTC(2026, 8, 10, 16, 30);
// 2026-09-10 17:30 UTC = 2026-09-11 00:30 in Bangkok (already the next Thai day)
const afterMidnight = Date.UTC(2026, 8, 10, 17, 30);

describe('addBangkokMonths', () => {
  it('adds months on the Thai calendar and keeps the time', () => {
    // 23:30 on 10 Sep (Bangkok) + 36 months → 23:30 on 10 Sep 2029 (Bangkok)
    expect(toBangkokParts(addBangkokMonths(lateEvening, 36))).toMatchObject({
      year: 2029,
      month: 9,
      day: 10,
      hour: 23,
      minute: 30,
    });
    expect(addBangkokMonths(lateEvening, 0)).toBe(lateEvening);
  });

  it('clamps to the end of shorter months and crosses years', () => {
    const jan31 = fromBangkokParts(2027, 1, 31, 10);
    expect(toBangkokParts(addBangkokMonths(jan31, 1))).toMatchObject({ month: 2, day: 28 });
    expect(toBangkokParts(addBangkokMonths(fromBangkokParts(2027, 11, 15), 3))).toMatchObject({
      year: 2028,
      month: 2,
      day: 15,
    });
  });
});

describe('Bangkok calendar parts', () => {
  it('shifts UTC to UTC+7', () => {
    expect(toBangkokParts(lateEvening)).toEqual({
      year: 2026,
      month: 9,
      day: 10,
      hour: 23,
      minute: 30,
      second: 0,
    });
    expect(toBangkokParts(afterMidnight).day).toBe(11);
  });

  it('round-trips through fromBangkokParts', () => {
    expect(fromBangkokParts(2026, 9, 10, 23, 30)).toBe(lateEvening);
  });

  it('uses the Thai date for day keys', () => {
    expect(bangkokDateKey(lateEvening)).toBe('2026-09-10');
    expect(bangkokDateKey(afterMidnight)).toBe('2026-09-11');
  });
});

describe('ranges', () => {
  it('starts a Thai day at 17:00 UTC of the previous UTC day', () => {
    const range = bangkokDayRange(lateEvening);
    expect(range.startMs).toBe(Date.UTC(2026, 8, 9, 17, 0));
    expect(range.endMs).toBe(Date.UTC(2026, 8, 10, 17, 0));
    // A sale at 00:30 Thai time belongs to the next day, not "today".
    expect(afterMidnight >= range.endMs).toBe(true);
  });

  it('covers a whole Thai month, including the December → January rollover', () => {
    expect(bangkokMonthRange(lateEvening)).toEqual({
      startMs: Date.UTC(2026, 7, 31, 17, 0),
      endMs: Date.UTC(2026, 8, 30, 17, 0),
    });
    const december = bangkokMonthRange(fromBangkokParts(2026, 12, 15));
    expect(december.endMs).toBe(fromBangkokParts(2027, 1, 1));
  });
});

describe('Thai formatting', () => {
  it('formats in the Buddhist Era by default', () => {
    expect(formatThaiDate(lateEvening)).toBe('10 ก.ย. 2569');
    expect(formatThaiDate(lateEvening, { month: 'long' })).toBe('10 กันยายน 2569');
    expect(formatThaiDate(lateEvening, { month: 'numeric' })).toBe('10/09/2569');
  });

  it('can format in the Common Era', () => {
    expect(formatThaiDate(lateEvening, { buddhistEra: false })).toBe('10 ก.ย. 2026');
  });

  it('formats time and date-time in Thai time', () => {
    expect(formatThaiTime(afterMidnight)).toBe('00:30');
    expect(formatThaiDateTime(afterMidnight)).toBe('11 ก.ย. 2569 00:30');
  });
});
