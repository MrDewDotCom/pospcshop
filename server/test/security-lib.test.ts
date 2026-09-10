import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { LoginThrottle } from '../src/lib/loginThrottle';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { respondByRole } from '../src/lib/respondByRole';
import { generateRecoveryCode, hashToken, normalizeRecoveryCode } from '../src/lib/tokens';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('รหัสผ่านภาษาไทย-123');
    expect(hash).toMatch(/^scrypt\$15\$8\$1\$/);
    expect(await verifyPassword('รหัสผ่านภาษาไทย-123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('tokens and recovery codes', () => {
  it('hashes tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toHaveLength(64);
  });

  it('normalizes typed recovery codes', () => {
    const code = generateRecoveryCode();
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(code.replaceAll('-', ''));
    expect(normalizeRecoveryCode('o0-il 1')).toBe('00111');
  });
});

describe('LoginThrottle', () => {
  it('locks a key after the limit and unlocks after the window', () => {
    const throttle = new LoginThrottle(3, 1000);
    for (let t = 0; t < 3; t++) throttle.recordFailure('k', t);
    expect(throttle.check('k', 10)).toEqual({ allowed: false, retryAfterMs: 990 });
    expect(throttle.check('other', 10).allowed).toBe(true);
    expect(throttle.check('k', 1000).allowed).toBe(true); // first failure expired
  });

  it('resets on success', () => {
    const throttle = new LoginThrottle(1, 1000);
    throttle.recordFailure('k', 0);
    throttle.reset('k');
    expect(throttle.check('k', 1).allowed).toBe(true);
  });
});

describe('respondByRole', () => {
  const staffSchema = z.object({ id: z.number(), priceSatang: z.number() });
  const ownerSchema = staffSchema.extend({ costSatang: z.number() });
  const product = { id: 1, priceSatang: 100, costSatang: 60, internalNote: 'x' };
  const asRole = (role: 'owner' | 'staff') =>
    ({ user: { id: 1, name: 'n', username: 'u', role } }) as unknown as FastifyRequest;

  it('gives the owner cost fields and strips undeclared keys', () => {
    expect(
      respondByRole(asRole('owner'), { owner: ownerSchema, staff: staffSchema }, product),
    ).toEqual({
      id: 1,
      priceSatang: 100,
      costSatang: 60,
    });
  });

  it('never gives staff cost fields', () => {
    expect(
      respondByRole(asRole('staff'), { owner: ownerSchema, staff: staffSchema }, product),
    ).toEqual({
      id: 1,
      priceSatang: 100,
    });
  });

  it('fails loudly if a staff schema accidentally declares a cost field', () => {
    expect(() =>
      respondByRole(asRole('staff'), { owner: ownerSchema, staff: ownerSchema }, product),
    ).toThrow(/forbidden keys/);
  });
});
