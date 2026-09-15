import { describe, expect, it } from 'vitest';
import { crc16, isPromptpayId, promptpayPayload } from './promptpay';

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

/** Splits an EMVCo payload into [tag, value] pairs. */
function parse(payload: string): [string, string][] {
  const fields: [string, string][] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const length = Number(payload.slice(i + 2, i + 4));
    fields.push([tag, payload.slice(i + 4, i + 4 + length)]);
    i += 4 + length;
  }
  return fields;
}

describe('promptpayPayload', () => {
  it('builds a dynamic QR for a phone number with the exact amount', () => {
    const payload = promptpayPayload('081-234-5678', 1_690_50);
    const fields = new Map(parse(payload));
    expect(fields.get('00')).toBe('01');
    expect(fields.get('01')).toBe('12');
    // AID, then tag 01 (phone) with 13 digits: 0812345678 → 0066812345678
    expect(fields.get('29')).toBe('0016A000000677010111' + '01130066812345678');
    expect(fields.get('58')).toBe('TH');
    expect(fields.get('53')).toBe('764');
    expect(fields.get('54')).toBe('1690.50');
    // The CRC covers everything before it, including its own "6304" header.
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it('builds a static QR when there is no amount', () => {
    const fields = new Map(parse(promptpayPayload('0812345678')));
    expect(fields.get('01')).toBe('11');
    expect(fields.has('54')).toBe(false);
  });

  it('uses the tax-ID and e-wallet tags for longer IDs', () => {
    expect(new Map(parse(promptpayPayload('1234567890123', 100))).get('29')).toContain(
      '02131234567890123',
    );
    expect(new Map(parse(promptpayPayload('123456789012345', 100))).get('29')).toContain(
      '0315123456789012345',
    );
  });

  it('formats whole-baht amounts with two decimals', () => {
    expect(new Map(parse(promptpayPayload('0812345678', 100_00))).get('54')).toBe('100.00');
    expect(new Map(parse(promptpayPayload('0812345678', 5))).get('54')).toBe('0.05');
  });

  it('recognises valid PromptPay IDs', () => {
    expect(isPromptpayId('081-234-5678')).toBe(true);
    expect(isPromptpayId('1234567890123')).toBe(true);
    expect(isPromptpayId('')).toBe(false);
    expect(isPromptpayId('12345')).toBe(false);
  });
});
