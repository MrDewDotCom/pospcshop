import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from 'cn';
import { specFieldsFor, type CategoryKind, type SpecField } from '@pcshop/shared';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SpecValues = Record<string, unknown>;

const NONE = '__none__';

function NumberInput({
  id,
  value,
  onChange,
  unit,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  unit?: string;
}) {
  // Keep the typed text so partial input like "3." isn't reformatted while typing.
  const [text, setText] = useState(value === undefined || value === null ? '' : String(value));
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        className={unit ? 'pr-14' : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const trimmed = next.trim().replace(/,/g, '');
          if (trimmed === '') onChange(undefined);
          else if (Number.isFinite(Number(trimmed))) onChange(Number(trimmed));
          else onChange(next); // left as text: the server answers "ต้องเป็นตัวเลข"
        }}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}

function SpecInput({
  field,
  value,
  onChange,
}: {
  field: SpecField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `spec-${field.key}`;
  switch (field.type) {
    case 'text':
      return (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case 'number':
      return <NumberInput id={id} value={value} onChange={onChange} unit={field.unit} />;
    case 'select':
    case 'boolean': {
      const options =
        field.type === 'boolean'
          ? [
              { value: 'true', label: 'มี' },
              { value: 'false', label: 'ไม่มี' },
            ]
          : field.options;
      const current = value === undefined || value === null ? NONE : String(value);
      return (
        <Select
          value={current}
          onValueChange={(v) =>
            onChange(v === NONE ? undefined : field.type === 'boolean' ? v === 'true' : v)
          }
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>– ไม่ระบุ –</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (option: string) => {
        const next = selected.includes(option)
          ? selected.filter((v) => v !== option)
          : [...selected, option];
        onChange(next.length ? next : undefined);
      };
      return (
        <div id={id} className="flex flex-wrap gap-1.5">
          {field.options.map((option) => {
            const on = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

/**
 * Spec form for a category kind, generated from the shared definitions. Fields used by the
 * compatibility checks (Phase 3) are marked so users know to fill them in.
 */
export function SpecFieldsEditor({
  kind,
  value,
  onChange,
  errors = {},
}: {
  kind: CategoryKind;
  value: SpecValues;
  onChange: (next: SpecValues) => void;
  /** Keyed by "specs.<key>" as returned by the server. */
  errors?: Record<string, string>;
}) {
  const fields = specFieldsFor(kind);
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        หมวดหมู่นี้ไม่มีช่องสเปกเฉพาะ ใส่รายละเอียดในช่องคำอธิบายได้
      </p>
    );
  }
  const set = (key: string, next: unknown) => {
    const copy = { ...value };
    if (next === undefined) delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const error = errors[`specs.${field.key}`];
        return (
          <Field key={`${kind}-${field.key}`} data-invalid={!!error}>
            <FieldLabel htmlFor={`spec-${field.key}`}>
              {field.label}
              {field.compat && (
                <ShieldCheck
                  className="size-3.5 text-sky-600"
                  aria-label="ใช้ตรวจความเข้ากันได้ของสเปก"
                >
                  <title>ใช้ตรวจความเข้ากันได้ของสเปก</title>
                </ShieldCheck>
              )}
            </FieldLabel>
            <SpecInput
              field={field}
              value={value[field.key]}
              onChange={(next) => set(field.key, next)}
            />
            <FieldError>{error}</FieldError>
          </Field>
        );
      })}
    </div>
  );
}
