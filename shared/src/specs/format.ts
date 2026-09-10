import type { CategoryKind } from '../enums';
import { specFieldsFor } from './definitions';

export interface SpecLine {
  key: string;
  label: string;
  value: string;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(value);
}

/**
 * Human-readable spec lines in definition order, e.g. { label: 'TDP', value: '65 W' }.
 * Used on product pages, in the stock lookup, on receipts, and for post image placeholders.
 */
export function formatSpecs(kind: CategoryKind, specs: Record<string, unknown>): SpecLine[] {
  const lines: SpecLine[] = [];
  for (const field of specFieldsFor(kind)) {
    const value = specs[field.key];
    if (value === undefined || value === null || value === '') continue;
    let text: string;
    if (field.type === 'boolean') text = value ? 'มี' : 'ไม่มี';
    else if (field.type === 'number' && typeof value === 'number') {
      text = field.unit ? `${formatNumber(value)} ${field.unit}` : formatNumber(value);
    } else if (Array.isArray(value)) text = value.join(', ');
    else text = String(value);
    lines.push({ key: field.key, label: field.label, value: text });
  }
  return lines;
}

/** One-line summary such as "ซ็อกเก็ต AM5 · 6 คอร์ · TDP 65 W". */
export function specSummary(kind: CategoryKind, specs: Record<string, unknown>, max = 4): string {
  return formatSpecs(kind, specs)
    .slice(0, max)
    .map((line) => `${line.label} ${line.value}`)
    .join(' · ');
}
