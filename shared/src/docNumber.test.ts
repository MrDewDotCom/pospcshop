import { describe, expect, it } from 'vitest';
import { toBangkokParts, fromBangkokParts } from './datetime';
import { defaultDocFormat, formatDocNumber, sequencePeriod, validateDocFormat } from './docNumber';

const sept10 = toBangkokParts(fromBangkokParts(2026, 9, 10, 14, 0));

describe('formatDocNumber', () => {
  it('uses the Buddhist Era by default formats', () => {
    expect(
      formatDocNumber(defaultDocFormat('sale'), { seq: 1, parts: sept10, buddhistEra: true }),
    ).toBe('RC6909-0001');
    expect(
      formatDocNumber(defaultDocFormat('sale'), { seq: 1, parts: sept10, buddhistEra: false }),
    ).toBe('RC2609-0001');
  });

  it('supports every token and grows past the padding width', () => {
    expect(
      formatDocNumber('INV-{YYYY}/{MM}/{DD}-{SEQ:3}', {
        seq: 12345,
        parts: sept10,
        buddhistEra: true,
      }),
    ).toBe('INV-2569/09/10-12345');
    expect(formatDocNumber('X{SEQ}', { seq: 7, parts: sept10, buddhistEra: true })).toBe('X7');
  });
});

describe('sequencePeriod', () => {
  it('keys monthly, yearly, and never-resetting sequences', () => {
    expect(sequencePeriod('monthly', sept10)).toBe('2026-09');
    expect(sequencePeriod('yearly', sept10)).toBe('2026');
    expect(sequencePeriod('never', sept10)).toBe('');
  });
});

describe('validateDocFormat', () => {
  it('accepts the defaults', () => {
    expect(validateDocFormat(defaultDocFormat('sale'), 'monthly')).toBeNull();
    expect(validateDocFormat('RC{YYYY}-{SEQ:5}', 'yearly')).toBeNull();
    expect(validateDocFormat('RC{SEQ:6}', 'never')).toBeNull();
  });

  it('requires a sequence number and known tokens', () => {
    expect(validateDocFormat('RC{YY}{MM}', 'monthly')).toMatch(/SEQ/);
    expect(validateDocFormat('RC{HH}{SEQ}', 'never')).toMatch(/ไม่รู้จัก/);
    expect(validateDocFormat('ใบเสร็จ{SEQ}', 'never')).toMatch(/ภาษาอังกฤษ/);
  });

  it('prevents repeated numbers when the counter restarts', () => {
    expect(validateDocFormat('RC{SEQ:4}', 'monthly')).toMatch(/เดือน/);
    expect(validateDocFormat('RC{YY}-{SEQ:4}', 'monthly')).toMatch(/เดือน/);
    expect(validateDocFormat('RC{MM}-{SEQ:4}', 'yearly')).toMatch(/ปี/);
  });
});
