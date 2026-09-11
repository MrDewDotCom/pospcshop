// Product tags (PLAN.md §7.9). Automatic tags are derived from product data here and never stored, so
// they're always up to date. Custom tags are owner-defined rows (name + a color from a fixed palette).

import { PRODUCT_CONDITION_LABELS, type ProductCondition, type WarrantyType } from './enums';
import { discountBadgeLabel } from './pricing';
import { formatWarranty } from './warranty';

/** Fixed palette for custom tags. The UI maps each key to its own classes. */
export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_COLOR_LABELS: Record<TagColor, string> = {
  gray: 'เทา',
  red: 'แดง',
  orange: 'ส้ม',
  amber: 'เหลือง',
  green: 'เขียว',
  teal: 'เขียวอมฟ้า',
  blue: 'น้ำเงิน',
  violet: 'ม่วง',
  pink: 'ชมพู',
};

export const AUTO_TAG_KEYS = [
  'condition',
  'warranty',
  'discount',
  'returned',
  'stock',
  'awaitingPrice',
] as const;
export type AutoTagKey = (typeof AUTO_TAG_KEYS)[number];

/** How a tag should look; the UI decides the actual colors. */
export const AUTO_TAG_TONES = [
  'neutral',
  'muted',
  'info',
  'discount',
  'warning',
  'danger',
] as const;
export type AutoTagTone = (typeof AUTO_TAG_TONES)[number];

export interface AutoTag {
  key: AutoTagKey;
  label: string;
  tone: AutoTagTone;
}

export interface AutoTagSource {
  condition: ProductCondition;
  warrantyType: WarrantyType;
  warrantyMonths: number;
  priceSatang: number | null;
  regularPriceSatang: number | null;
  trackStock: boolean;
  onHand: number;
  minStock: number;
  /** Units returned by customers that are still in quarantine (Phase 2). */
  pendingReturnQty?: number;
}

/**
 * The automatic tags for a product, in display order. Stock tags follow the product list filters:
 * "หมด" when nothing is on hand, "ใกล้หมด" when 0 < on hand ≤ min stock (never both).
 */
export function deriveAutoTags(p: AutoTagSource): AutoTag[] {
  const tags: AutoTag[] = [];

  if (p.priceSatang === null) {
    tags.push({ key: 'awaitingPrice', label: 'รอตั้งราคา', tone: 'warning' });
  }
  const discount = discountBadgeLabel(p);
  if (discount) tags.push({ key: 'discount', label: discount, tone: 'discount' });

  tags.push({
    key: 'condition',
    label: PRODUCT_CONDITION_LABELS[p.condition],
    tone: p.condition === 'used' ? 'info' : 'neutral',
  });

  const hasWarranty = p.warrantyType !== 'none' && p.warrantyMonths > 0;
  tags.push({
    key: 'warranty',
    label: formatWarranty(p.warrantyType, p.warrantyMonths),
    tone: hasWarranty ? 'neutral' : 'muted',
  });

  if (p.trackStock) {
    if (p.onHand <= 0) tags.push({ key: 'stock', label: 'หมด', tone: 'danger' });
    else if (p.onHand <= p.minStock) tags.push({ key: 'stock', label: 'ใกล้หมด', tone: 'warning' });
  }

  const returned = p.pendingReturnQty ?? 0;
  if (returned > 0) {
    tags.push({ key: 'returned', label: `สินค้าคืน ${returned} ชิ้น`, tone: 'warning' });
  }
  return tags;
}
