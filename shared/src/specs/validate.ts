import { z } from 'zod';
import type { CategoryKind } from '../enums';
import { specFieldsFor, type SpecField } from './definitions';

export type Specs = Record<string, string | number | boolean | string[]>;

function fieldSchema(field: SpecField): z.ZodType {
  switch (field.type) {
    case 'text':
      return z
        .string()
        .trim()
        .min(1)
        .max(100, { error: `${field.label}: ยาวเกินไป` });
    case 'number':
      return z
        .number({ error: `${field.label}: ต้องเป็นตัวเลข` })
        .min(0, { error: `${field.label}: ต้องไม่ติดลบ` })
        .max(field.max ?? 1_000_000, { error: `${field.label}: ค่าสูงเกินไป` });
    case 'select':
      return z.enum(field.options.map((o) => o.value) as [string, ...string[]], {
        error: `${field.label}: ตัวเลือกไม่ถูกต้อง`,
      });
    case 'multiselect':
      return z
        .array(z.enum(field.options.map((o) => o.value) as [string, ...string[]]))
        .min(1)
        .transform((values) => [...new Set(values)]);
    case 'boolean':
      return z.boolean();
  }
}

/**
 * Zod schema for a kind's specs: every field is optional, and keys that don't belong to the kind are
 * dropped (e.g. after moving a product to another category).
 */
export function specsSchemaFor(kind: CategoryKind) {
  const shape = Object.fromEntries(
    specFieldsFor(kind).map((field) => [field.key, fieldSchema(field).optional()]),
  );
  return z.object(shape) as unknown as z.ZodType<Specs>;
}

/** Removes empty values ("", [], null, undefined) so they aren't validated or stored. */
export function compactSpecs(specs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(specs).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
}

/** Validates specs for a kind. Returns the cleaned specs or Thai error messages. */
export function parseSpecs(
  kind: CategoryKind,
  specs: Record<string, unknown>,
): { ok: true; specs: Specs } | { ok: false; errors: { path: string; message: string }[] } {
  const result = specsSchemaFor(kind).safeParse(compactSpecs(specs));
  if (result.success) return { ok: true, specs: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: `specs.${issue.path.map(String).join('.')}`,
      message: issue.message,
    })),
  };
}
