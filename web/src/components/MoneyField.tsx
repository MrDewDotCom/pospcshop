import type { UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { parseBahtInput } from '@pcshop/shared';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * Money is typed as baht text ("1,290.50") and converted to integer satang on submit with
 * parseBahtInput, so there are never floating-point amounts.
 */
export const bahtTextSchema = z.string().refine((value) => parseBahtInput(value) !== null, {
  error: 'กรุณากรอกจำนวนเงินให้ถูกต้อง เช่น 1290 หรือ 1,290.50',
});

export function MoneyField({
  label,
  registration,
  error,
  description,
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  description?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={registration.name}>{label}</FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          ฿
        </span>
        <Input
          id={registration.name}
          inputMode="decimal"
          autoComplete="off"
          className="pl-7 text-right tabular-nums"
          aria-invalid={!!error}
          {...registration}
        />
      </div>
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
