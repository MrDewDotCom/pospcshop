// Password hashing with Node's built-in scrypt (no native dependency).
// Stored format: scrypt$<log2 N>$<r>$<p>$<salt base64>$<hash base64>

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const LOG2_N = 15; // N = 32768 → ~32 MB and tens of milliseconds per hash
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function scryptAsync(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

function optionsFor(log2N: number, r: number, p: number): ScryptOptions {
  const N = 2 ** log2N;
  return { N, r, p, maxmem: 128 * N * r * 2 };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, optionsFor(LOG2_N, BLOCK_SIZE, PARALLELISM));
  return [
    'scrypt',
    LOG2_N,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, log2N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64!, 'base64');
  const actual = await scryptAsync(
    password,
    Buffer.from(saltB64!, 'base64'),
    optionsFor(Number(log2N), Number(r), Number(p)),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real verification. Used when the username doesn't exist so response
 * timing doesn't reveal which usernames are valid.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
  return false;
}
