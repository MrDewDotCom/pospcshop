import { z } from 'zod';
import {
  OWNER_PASSWORD_MIN_LENGTH,
  displayNameSchema,
  passwordSchema,
  usernameSchema,
} from './auth';
import type { MeResponse } from './auth';
import { shopInfoInputSchema } from './shop';

export const setupInputSchema = z.object({
  owner: z.object({
    name: displayNameSchema,
    username: usernameSchema,
    password: passwordSchema(OWNER_PASSWORD_MIN_LENGTH),
  }),
  shop: shopInfoInputSchema,
});
export type SetupInput = z.input<typeof setupInputSchema>;

/** Public (no login needed): lets the login page show the shop's name. */
export interface SetupStatusResponse {
  needsSetup: boolean;
  shopName: string | null;
}

export interface SetupResponse extends MeResponse {
  /** Shown once. The owner uses it to reset a forgotten password. */
  recoveryCode: string;
}
