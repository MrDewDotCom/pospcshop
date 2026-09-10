import { and, eq } from 'drizzle-orm';
import { minPasswordLength, type SessionUser } from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { shopSettings, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, unauthorized } from '../../lib/errors';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/password';
import { generateRecoveryCode, normalizeRecoveryCode } from '../../lib/tokens';
import { endUserSessions } from '../../plugins/auth';

const INVALID_CREDENTIALS = () =>
  unauthorized('INVALID_CREDENTIALS', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

/** Checks a username/password pair. Throws INVALID_CREDENTIALS for any failure (no hints). */
export async function authenticate(
  db: AppDatabase,
  username: string,
  password: string,
): Promise<SessionUser> {
  const user = db.select().from(users).where(eq(users.username, username)).get();
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyAgainstDummy(password);
  if (!user || !valid || !user.isActive) throw INVALID_CREDENTIALS();

  db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id)).run();
  return { id: user.id, name: user.name, username: user.username, role: user.role };
}

function assertPasswordLength(role: SessionUser['role'], password: string): void {
  const min = minPasswordLength(role);
  if (password.length < min) {
    throw badRequest('PASSWORD_TOO_SHORT', `รหัสผ่านต้องมีอย่างน้อย ${min} ตัวอักษร`);
  }
}

/** Changes the current user's password and signs out their other sessions. */
export async function changePassword(
  db: AppDatabase,
  user: SessionUser,
  currentSessionId: string | null,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    throw badRequest('WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  }
  assertPasswordLength(user.role, newPassword);
  const passwordHash = await hashPassword(newPassword);

  db.transaction((tx) => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    endUserSessions(tx, user.id, currentSessionId ?? undefined);
    writeAudit(tx, {
      userId: user.id,
      action: 'auth.change_password',
      entityType: 'user',
      entityId: user.id,
    });
  });
}

/**
 * Resets an owner's password with the one-time recovery code shown at setup.
 * Returns a new recovery code; the used one stops working.
 */
export async function recoverOwnerPassword(
  db: AppDatabase,
  username: string,
  recoveryCode: string,
  newPassword: string,
): Promise<string> {
  const owner = db
    .select()
    .from(users)
    .where(and(eq(users.username, username), eq(users.role, 'owner'), eq(users.isActive, true)))
    .get();
  const settings = db.select().from(shopSettings).get();
  const storedHash = settings?.recoveryCodeHash;
  const valid =
    owner && storedHash
      ? await verifyPassword(normalizeRecoveryCode(recoveryCode), storedHash)
      : await verifyAgainstDummy(recoveryCode);
  if (!owner || !valid) {
    throw unauthorized('INVALID_RECOVERY', 'ชื่อผู้ใช้หรือรหัสกู้คืนไม่ถูกต้อง');
  }

  assertPasswordLength('owner', newPassword);
  const passwordHash = await hashPassword(newPassword);
  const nextCode = generateRecoveryCode();
  const nextCodeHash = await hashPassword(normalizeRecoveryCode(nextCode));

  db.transaction((tx) => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, owner.id)).run();
    tx.update(shopSettings).set({ recoveryCodeHash: nextCodeHash }).run();
    endUserSessions(tx, owner.id);
    writeAudit(tx, {
      userId: owner.id,
      action: 'auth.recover',
      entityType: 'user',
      entityId: owner.id,
    });
  });
  return nextCode;
}
