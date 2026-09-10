// Money helpers. Every amount in the system is an integer number of satang (1 baht = 100 satang).
// Never use floats for money: parse user input with parseBahtInput and round only with divRound.

export const SATANG_PER_BAHT = 100;

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${value}`);
  }
}

/** True when `value` is a valid satang amount (a safe integer). */
export function isSatang(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Throws unless `value` is a valid satang amount. Use where money enters business logic. */
export function assertSatang(value: number, label = 'amount'): void {
  assertInteger(value, label);
}

/**
 * Integer division rounded half away from zero (half-up for positive values).
 * This is the only rounding function allowed in money math. BigInt keeps it exact for any safe integers.
 */
export function divRound(numerator: number, denominator: number): number {
  assertInteger(numerator, 'numerator');
  assertInteger(denominator, 'denominator');
  if (denominator === 0) throw new RangeError('denominator must not be zero');

  const n = BigInt(numerator);
  const d = BigInt(denominator);
  let quotient = n / d; // BigInt division truncates toward zero
  const remainder = n % d;
  if (remainder !== 0n) {
    const absRemainder = remainder < 0n ? -remainder : remainder;
    const absDenominator = d < 0n ? -d : d;
    if (absRemainder * 2n >= absDenominator) {
      quotient += n < 0n !== d < 0n ? -1n : 1n;
    }
  }
  return Number(quotient);
}

/** Converts whole baht to satang, e.g. 1290 → 129000. */
export function baht(amount: number): number {
  assertInteger(amount, 'baht');
  return amount * SATANG_PER_BAHT;
}

/**
 * Parses a baht amount typed by a user ("1,290", "1290.5", "฿1,290.50") into satang.
 * Returns null for anything that isn't a non-negative amount with at most 2 decimal places.
 */
export function parseBahtInput(text: string): number | null {
  const cleaned = text.replace(/[\s,฿]/g, '');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const wholeBaht = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const satang = wholeBaht * SATANG_PER_BAHT + fraction;
  return Number.isSafeInteger(satang) ? satang : null;
}

/** Formats satang for an editable input field: 129000 → "1290", 129050 → "1290.50" (no grouping). */
export function satangToInput(satang: number): string {
  assertInteger(satang, 'satang');
  const sign = satang < 0 ? '-' : '';
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / SATANG_PER_BAHT);
  const fraction = abs % SATANG_PER_BAHT;
  return fraction === 0
    ? `${sign}${whole}`
    : `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}

export interface FormatBahtOptions {
  /** Prefix with "฿". Default false. */
  symbol?: boolean;
  /** "always" → 1,290.00 (documents); "auto" → 1,290 unless there are satang (UI). Default "always". */
  decimals?: 'always' | 'auto';
}

const thousandGrouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Formats satang for display with thousand separators: 129000 → "1,290.00" or "฿1,290". */
export function formatBaht(satang: number, options: FormatBahtOptions = {}): string {
  assertInteger(satang, 'satang');
  const { symbol = false, decimals = 'always' } = options;
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / SATANG_PER_BAHT);
  const fraction = abs % SATANG_PER_BAHT;
  const showFraction = decimals === 'always' || fraction !== 0;
  const number =
    thousandGrouping.format(whole) + (showFraction ? `.${String(fraction).padStart(2, '0')}` : '');
  return `${satang < 0 ? '-' : ''}${symbol ? '฿' : ''}${number}`;
}
