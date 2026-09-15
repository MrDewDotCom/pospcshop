import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['0812345678', '0812345678'],
    ['081-234-5678', '0812345678'],
    [' 081 234 5678 ', '0812345678'],
    ['+66 81 234 5678', '0812345678'],
    ['66812345678', '0812345678'],
    ['+66 2 123 4567', '021234567'],
    ['02-123-4567', '021234567'],
    ['๐๘๑๒๓๔๕๖๗๘', '0812345678'],
    ['', ''],
    ['ไม่มี', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
