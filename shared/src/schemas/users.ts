import { z } from 'zod';
import { ROLES } from '../enums';
import {
  STAFF_PASSWORD_MIN_LENGTH,
  displayNameSchema,
  passwordSchema,
  usernameSchema,
} from './auth';
import { isoDateTimeSchema, paginationQuerySchema } from './common';

export const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  username: z.string(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

// Owners need 8+ characters; that depends on the role, so the server re-checks it.
export const createUserInputSchema = z.object({
  name: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema(STAFF_PASSWORD_MIN_LENGTH),
  role: z.enum(ROLES),
});
export type CreateUserInput = z.input<typeof createUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    name: displayNameSchema,
    role: z.enum(ROLES),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateUserInput = z.input<typeof updateUserInputSchema>;

export const resetUserPasswordInputSchema = z.object({
  newPassword: passwordSchema(STAFF_PASSWORD_MIN_LENGTH),
});
export type ResetUserPasswordInput = z.input<typeof resetUserPasswordInputSchema>;

export const auditLogQuerySchema = paginationQuerySchema.extend({
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().min(1).optional(),
});
export type AuditLogQuery = z.input<typeof auditLogQuerySchema>;

export const auditLogItemSchema = z.object({
  id: z.number().int(),
  createdAt: isoDateTimeSchema,
  action: z.string(),
  userId: z.number().int().nullable(),
  userName: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.number().int().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditLogItem = z.infer<typeof auditLogItemSchema>;
