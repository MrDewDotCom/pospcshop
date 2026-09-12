import { z } from 'zod';
import { DOC_TYPES, SEQUENCE_RESET_POLICIES } from '../enums';
import { validateDocFormat } from '../docNumber';
import { shopInfoInputSchema } from './shop';

/** What every logged-in user may read: shop details for display and documents. */
export const staffShopSettingsSchema = z.object({
  shopName: z.string(),
  logoFileId: z.number().int().nullable(),
  logoUrl: z.string().nullable(),
  address: z.string(),
  phone: z.string(),
  lineId: z.string(),
  promptpayId: z.string(),
  receiptFooter: z.string(),
  useBuddhistEra: z.boolean(),
  allowNegativeStock: z.boolean(),
});
export type StaffShopSettings = z.infer<typeof staffShopSettingsSchema>;

/** The owner also sees fees and (later) backup settings. */
export const ownerShopSettingsSchema = staffShopSettingsSchema.extend({
  defaultAssemblyFeeSatang: z.number().int(),
  updatedAt: z.string(),
});
export type OwnerShopSettings = z.infer<typeof ownerShopSettingsSchema>;

/** Either shape, depending on the role (use `'defaultAssemblyFeeSatang' in s` to tell them apart). */
export type ShopSettings = StaffShopSettings | OwnerShopSettings;

export const updateShopSettingsInputSchema = shopInfoInputSchema
  .extend({
    logoFileId: z.number().int().positive().nullable(),
    receiptFooter: z.string().trim().max(500, { error: 'ยาวได้ไม่เกิน 500 ตัวอักษร' }),
    useBuddhistEra: z.boolean(),
    allowNegativeStock: z.boolean(),
    defaultAssemblyFeeSatang: z
      .number()
      .int()
      .min(0, { error: 'ค่าประกอบต้องไม่ติดลบ' })
      .max(100_000_00, { error: 'ค่าประกอบสูงเกินไป' }),
  })
  .partial();
export type UpdateShopSettingsInput = z.input<typeof updateShopSettingsInputSchema>;

export const docTypeParamSchema = z.object({ docType: z.enum(DOC_TYPES) });

export const documentSequenceSchema = z.object({
  docType: z.enum(DOC_TYPES),
  format: z.string(),
  resetPolicy: z.enum(SEQUENCE_RESET_POLICIES),
  lastNumber: z.number().int(),
  /** What the next document of this type would be numbered, e.g. "RC6909-0015". */
  nextNumberPreview: z.string(),
});
export type DocumentSequence = z.infer<typeof documentSequenceSchema>;

export const updateDocumentSequenceInputSchema = z
  .object({
    format: z.string().trim(),
    resetPolicy: z.enum(SEQUENCE_RESET_POLICIES),
  })
  .superRefine((value, ctx) => {
    const problem = validateDocFormat(value.format, value.resetPolicy);
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['format'] });
  });
export type UpdateDocumentSequenceInput = z.input<typeof updateDocumentSequenceInputSchema>;

export interface NetworkAddress {
  address: string;
  interfaceName: string;
  /** Most likely the shop WiFi/LAN address (private range, not a virtual adapter). */
  recommended: boolean;
}

export interface NetworkInfoResponse {
  hostname: string;
  /** The port the server listens on. In development, phones should use the Vite port instead. */
  port: number;
  addresses: NetworkAddress[];
}

/** What the owner needs when asking for support: version and where the shop's data lives. */
export interface SystemInfoResponse {
  version: string;
  /** The data directory, or null when the server runs without one (tests). */
  dataDir: string | null;
  node: string;
  platform: string;
}
