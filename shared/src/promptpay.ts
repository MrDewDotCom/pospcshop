// PromptPay "Thai QR Payment" payload (EMVCo merchant-presented QR), built by hand instead of the
// promptpay-qr package (P26): the format is a short list of tag-length-value fields plus a CRC.
// The result is text; the web app renders it as a QR code with the `qrcode` package.

import { assertSatang, SATANG_PER_BAHT } from './money';

const PROMPTPAY_AID = 'A000000677010111';

/** One EMVCo field: 2-digit tag, 2-digit length, value. */
function field(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, initial 0xFFFF), as the EMVCo spec requires. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Tag and value for the PromptPay target. Phone 0812345678 → "0066812345678" (tag 01);
 * national/tax ID, 13 digits (tag 02); e-wallet, 15 digits (tag 03).
 */
function promptpayTarget(id: string): [string, string] {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 15) return ['03', digits];
  if (digits.length >= 13) return ['02', digits];
  return ['01', `0000000000000${digits.replace(/^0/, '66')}`.slice(-13)];
}

/** True when `id` looks like a PromptPay ID the shop could use (see promptpayIdSchema). */
export function isPromptpayId(id: string): boolean {
  return /^(0\d{9}|\d{13}|\d{15})$/.test(id.replace(/[\s-]/g, ''));
}

/**
 * The text to put in a PromptPay QR code. With an amount the QR is "dynamic": the customer's bank app
 * fills in exactly that amount.
 */
export function promptpayPayload(id: string, amountSatang?: number): string {
  const [targetTag, target] = promptpayTarget(id);
  const fields = [
    field('00', '01'), // payload format
    field('01', amountSatang === undefined ? '11' : '12'), // static / dynamic (one-time amount)
    field('29', field('00', PROMPTPAY_AID) + field(targetTag, target)),
    field('58', 'TH'),
    field('53', '764'), // THB
  ];
  if (amountSatang !== undefined) {
    assertSatang(amountSatang, 'amountSatang');
    const baht = Math.floor(amountSatang / SATANG_PER_BAHT);
    const satang = String(amountSatang % SATANG_PER_BAHT).padStart(2, '0');
    fields.push(field('54', `${baht}.${satang}`));
  }
  const withoutCrc = `${fields.join('')}6304`;
  return withoutCrc + crc16(withoutCrc);
}
