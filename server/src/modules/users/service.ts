import { and, asc, count, eq, ne } from 'drizzle-orm';
import {
  minPasswordLength,
  type CreateUserInput,
  type Role,
  type SessionUser,
  type UpdateUserInput,
  type User,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { toIso, toIsoOrNull } from '../../lib/time';
import { endUserSessions } from '../../plugins/auth';

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    isActive: row.isActive,
    lastLoginAt: toIsoOrNull(row.lastLoginAt),
    createdAt: toIso(row.createdAt),
  };
}

function assertPasswordLength(role: Role, password: string): void {
  const min = minPasswordLength(role);
  if (password.length < min) {
    throw badRequest('PASSWORD_TOO_SHORT', `รหัสผ่านต้องมีอย่างน้อย ${min} ตัวอักษร`);
  }
}

const USER_NOT_FOUND = () => notFound('ไม่พบผู้ใช้นี้');

export function listUsers(db: AppDatabase): User[] {
  // Owners first, then by name.
  return db.select().from(users).orderBy(asc(users.role), asc(users.name)).all().map(toUser);
}

export async function createUser(
  db: AppDatabase,
  actor: SessionUser,
  input: CreateUserInput,
): Promise<User> {
  assertPasswordLength(input.role, input.password);
  const passwordHash = await hashPassword(input.password);

  return db.transaction((tx) => {
    if (tx.select({ id: users.id }).from(users).where(eq(users.username, input.username)).get()) {
      throw conflict('USERNAME_TAKEN', 'ชื่อผู้ใช้นี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น');
    }
    const row = tx
      .insert(users)
      .values({ name: input.name, username: input.username, passwordHash, role: input.role })
      .returning()
      .get();
    writeAudit(tx, {
      userId: actor.id,
      action: 'user.create',
      entityType: 'user',
      entityId: row.id,
      detail: { username: row.username, role: row.role },
    });
    return toUser(row);
  });
}

export function updateUser(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  input: UpdateUserInput,
): User {
  return db.transaction((tx) => {
    const before = tx.select().from(users).where(eq(users.id, id)).get();
    if (!before) throw USER_NOT_FOUND();

    if (id === actor.id && input.isActive === false) {
      throw conflict('CANNOT_DEACTIVATE_SELF', 'ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้');
    }
    if (id === actor.id && input.role === 'staff') {
      throw conflict('CANNOT_DEMOTE_SELF', 'ไม่สามารถลดสิทธิ์บัญชีของตัวเองได้');
    }

    const after = { ...before, ...input };
    const wasActiveOwner = before.role === 'owner' && before.isActive;
    const isActiveOwner = after.role === 'owner' && after.isActive;
    if (wasActiveOwner && !isActiveOwner) {
      const otherActiveOwners = tx
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, 'owner'), eq(users.isActive, true), ne(users.id, id)))
        .get()!.n;
      if (otherActiveOwners === 0) {
        throw conflict('LAST_OWNER', 'ต้องมีเจ้าของร้านที่ใช้งานอยู่อย่างน้อย 1 คน');
      }
    }

    const row = tx.update(users).set(input).where(eq(users.id, id)).returning().get();
    // A deactivated user is signed out everywhere immediately. (Role changes apply on the next
    // request anyway, because every request reads the role from the users table.)
    if (before.isActive && !row.isActive) endUserSessions(tx, id);

    const changes = Object.fromEntries(
      (Object.keys(input) as (keyof UpdateUserInput)[])
        .filter((key) => before[key] !== row[key])
        .map((key) => [key, { from: before[key], to: row[key] }]),
    );
    if (Object.keys(changes).length > 0) {
      writeAudit(tx, {
        userId: actor.id,
        action: 'user.update',
        entityType: 'user',
        entityId: id,
        detail: { username: row.username, changes },
      });
    }
    return toUser(row);
  });
}

/** The owner sets a new password for a user (e.g. staff who forgot theirs). */
export async function resetUserPassword(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  newPassword: string,
): Promise<void> {
  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) throw USER_NOT_FOUND();
  assertPasswordLength(target.role, newPassword);
  const passwordHash = await hashPassword(newPassword);

  db.transaction((tx) => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
    endUserSessions(tx, id);
    writeAudit(tx, {
      userId: actor.id,
      action: 'user.reset_password',
      entityType: 'user',
      entityId: id,
      detail: { username: target.username },
    });
  });
}
