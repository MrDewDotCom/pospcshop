import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Random session token for the cookie. Only its hash is stored in the database. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Crockford base32: no I, L, O, U, so codes are easy to read aloud and copy by hand.
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A one-time owner recovery code like "7K2QX-M9D4T-HB3WN-R6PZC" (100 bits of randomness). */
export function generateRecoveryCode(): string {
  const chars = Array.from(
    { length: 20 },
    () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
  );
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-');
}

/** Normalizes a typed recovery code: case, dashes/spaces, and look-alike letters don't matter. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

const TEMP_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Readable temporary password for the CLI reset (the user should change it after logging in). */
export function generateTemporaryPassword(length = 10): string {
  return Array.from(
    { length },
    () => TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)],
  ).join('');
}
