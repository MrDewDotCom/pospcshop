import { WARRANTY_TYPE_LABELS, type WarrantyType } from './enums';

/** A warranty period in Thai: 36 → "3 ปี", 6 → "6 เดือน", 18 → "1 ปี 6 เดือน". */
export function formatWarrantyPeriod(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years > 0 && `${years} ปี`, rest > 0 && `${rest} เดือน`].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0 เดือน';
}

/** Warranty as shown on tags and receipts: "ประกันศูนย์ 3 ปี", "ประกันร้าน 6 เดือน", "ไม่มีประกัน". */
export function formatWarranty(type: WarrantyType, months: number): string {
  if (type === 'none' || months <= 0) return WARRANTY_TYPE_LABELS.none;
  return `${WARRANTY_TYPE_LABELS[type]} ${formatWarrantyPeriod(months)}`;
}
