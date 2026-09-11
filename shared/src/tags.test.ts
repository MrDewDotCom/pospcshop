import { describe, expect, it } from 'vitest';
import { deriveAutoTags, type AutoTagSource } from './tags';

const base: AutoTagSource = {
  condition: 'new',
  warrantyType: 'distributor',
  warrantyMonths: 36,
  priceSatang: 10_000,
  regularPriceSatang: null,
  trackStock: true,
  onHand: 5,
  minStock: 2,
};
const labels = (p: Partial<AutoTagSource>) => deriveAutoTags({ ...base, ...p }).map((t) => t.label);
const byKey = (p: Partial<AutoTagSource>, key: string) =>
  deriveAutoTags({ ...base, ...p }).find((t) => t.key === key);

describe('deriveAutoTags', () => {
  it('always shows condition and warranty', () => {
    expect(labels({})).toEqual(['ใหม่', 'ประกันศูนย์ 3 ปี']);
    expect(labels({ condition: 'used', warrantyType: 'shop', warrantyMonths: 6 })).toEqual([
      'มือสอง',
      'ประกันร้าน 6 เดือน',
    ]);
    expect(byKey({ warrantyType: 'none' }, 'warranty')).toMatchObject({
      label: 'ไม่มีประกัน',
      tone: 'muted',
    });
    // A warranty type with 0 months is no warranty.
    expect(byKey({ warrantyType: 'shop', warrantyMonths: 0 }, 'warranty')?.label).toBe(
      'ไม่มีประกัน',
    );
  });

  it('shows the discount badge rounded down, and "awaiting price"', () => {
    expect(byKey({ priceSatang: 7_900, regularPriceSatang: 10_000 }, 'discount')?.label).toBe(
      '-21%',
    );
    expect(byKey({ regularPriceSatang: 9_000 }, 'discount')).toBeUndefined();
    expect(byKey({ priceSatang: null }, 'awaitingPrice')).toMatchObject({
      label: 'รอตั้งราคา',
      tone: 'warning',
    });
    expect(byKey({ priceSatang: null, regularPriceSatang: 10_000 }, 'discount')).toBeUndefined();
  });

  it('shows "out" and "low" stock without overlapping, only for stock-tracked products', () => {
    expect(byKey({ onHand: 0 }, 'stock')?.label).toBe('หมด');
    expect(byKey({ onHand: -1 }, 'stock')?.label).toBe('หมด');
    expect(byKey({ onHand: 2 }, 'stock')?.label).toBe('ใกล้หมด');
    expect(byKey({ onHand: 3 }, 'stock')).toBeUndefined();
    expect(byKey({ onHand: 0, minStock: 0 }, 'stock')?.label).toBe('หมด');
    expect(byKey({ onHand: 0, trackStock: false }, 'stock')).toBeUndefined();
  });

  it('shows units pending in return quarantine', () => {
    expect(byKey({ pendingReturnQty: 2 }, 'returned')?.label).toBe('สินค้าคืน 2 ชิ้น');
    expect(byKey({ pendingReturnQty: 0 }, 'returned')).toBeUndefined();
  });
});
