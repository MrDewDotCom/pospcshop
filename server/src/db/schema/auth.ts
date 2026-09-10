import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ROLES } from '@pcshop/shared';
import { createdAt, enumCheck, updatedAt } from './helpers';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /** Stored lowercase. */
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: integer('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [enumCheck('users', 'role', ROLES)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** sha256 of the session token. The raw token only ever lives in the user's cookie. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: integer('last_seen_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);
