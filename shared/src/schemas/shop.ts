import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `ยาวได้ไม่เกิน ${max} ตัวอักษร` })
    .default('');

/**
 * PromptPay ID: a mobile number (10 digits starting with 0), a national/tax ID (13 digits), or an
 * e-wallet ID (15 digits). Dashes and spaces are removed. Empty means "not set".
 */
export const promptpayIdSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => value === '' || /^(0\d{9}|\d{13}|\d{15})$/.test(value), {
    error:
      'พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก',
  });

/** Shop details entered in the first-run wizard (and later on the settings page). */
export const shopInfoInputSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(1, { error: 'กรุณากรอกชื่อร้าน' })
    .max(120, { error: 'ชื่อร้านยาวเกินไป' }),
  phone: optionalText(40),
  address: optionalText(500),
  lineId: optionalText(60),
  promptpayId: promptpayIdSchema.default(''),
});
export type ShopInfoInput = z.input<typeof shopInfoInputSchema>;
