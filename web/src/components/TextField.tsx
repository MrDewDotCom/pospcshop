import { useState, type ComponentProps } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface BaseProps {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  description?: string;
  required?: boolean;
}

type TextFieldProps = BaseProps & Omit<ComponentProps<'input'>, keyof UseFormRegisterReturn>;

/** Labeled input wired to React Hook Form. Password inputs get a show/hide button. */
export function TextField({
  label,
  registration,
  error,
  description,
  required,
  type = 'text',
  id,
  ...inputProps
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const inputId = id ?? registration.name;
  const isPassword = type === 'password';

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={inputId}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      <div className="relative">
        <Input
          id={inputId}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={!!error}
          className={isPassword ? 'pr-10' : undefined}
          {...inputProps}
          {...registration}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={revealed ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            tabIndex={-1}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

type TextAreaFieldProps = BaseProps & Omit<ComponentProps<'textarea'>, keyof UseFormRegisterReturn>;

export function TextAreaField({
  label,
  registration,
  error,
  description,
  required,
  id,
  ...props
}: TextAreaFieldProps) {
  const inputId = id ?? registration.name;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={inputId}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      <Textarea id={inputId} aria-invalid={!!error} {...props} {...registration} />
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
