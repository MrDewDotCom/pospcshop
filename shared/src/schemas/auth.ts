import { z } from 'zod';
import { ROLES } from '../enums';

// Validation messages are Thai because forms show them directly to users.

export const OWNER_PASSWORD_MIN_LENGTH = 8;
export const STAFF_PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;

export function minPasswordLength(role: (typeof ROLES)[number]): number {
  return role === 'owner' ? OWNER_PASSWORD_MIN_LENGTH : STAFF_PASSWORD_MIN_LENGTH;
}

/** Login names: lowercase a–z, 0–9, dot, dash, underscore; 3–32 characters. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, {
    error: 'ชื่อผู้ใช้ต้องมี 3–32 ตัว ใช้ได้เฉพาะ a-z, 0-9, จุด (.), ขีด (-) และขีดล่าง (_)',
  });

export function passwordSchema(minLength: number) {
  return z
    .string()
    .min(minLength, { error: `รหัสผ่านต้องมีอย่างน้อย ${minLength} ตัวอักษร` })
    .max(PASSWORD_MAX_LENGTH, { error: `รหัสผ่านยาวได้ไม่เกิน ${PASSWORD_MAX_LENGTH} ตัวอักษร` });
}

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'กรุณากรอกชื่อ' })
  .max(100, { error: 'ชื่อยาวเกินไป' });

export const loginInputSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, { error: 'กรุณากรอกชื่อผู้ใช้' }),
  password: z.string().min(1, { error: 'กรุณากรอกรหัสผ่าน' }),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, { error: 'กรุณากรอกรหัสผ่านปัจจุบัน' }),
  // The owner's stricter minimum is checked on the server, which knows the role.
  newPassword: passwordSchema(STAFF_PASSWORD_MIN_LENGTH),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export const recoverInputSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, { error: 'กรุณากรอกชื่อผู้ใช้' }),
  recoveryCode: z.string().trim().min(1, { error: 'กรุณากรอกรหัสกู้คืน' }),
  newPassword: passwordSchema(OWNER_PASSWORD_MIN_LENGTH),
});
export type RecoverInput = z.infer<typeof recoverInputSchema>;

export const sessionUserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  username: z.string(),
  role: z.enum(ROLES),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export interface MeResponse {
  user: SessionUser;
  permissions: string[];
}

export interface RecoverResponse {
  /** The new one-time recovery code (the old one no longer works). */
  recoveryCode: string;
}
