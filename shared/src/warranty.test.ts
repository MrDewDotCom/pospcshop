import { describe, expect, it } from 'vitest';
import { formatWarranty, formatWarrantyPeriod } from './warranty';

describe('warranty text', () => {
  it('formats periods in years and months', () => {
    expect(formatWarrantyPeriod(36)).toBe('3 ปี');
    expect(formatWarrantyPeriod(6)).toBe('6 เดือน');
    expect(formatWarrantyPeriod(18)).toBe('1 ปี 6 เดือน');
    expect(formatWarrantyPeriod(0)).toBe('0 เดือน');
  });

  it('combines the type and period', () => {
    expect(formatWarranty('distributor', 36)).toBe('ประกันศูนย์ 3 ปี');
    expect(formatWarranty('shop', 6)).toBe('ประกันร้าน 6 เดือน');
    expect(formatWarranty('none', 12)).toBe('ไม่มีประกัน');
    // A warranty type without a period means no warranty.
    expect(formatWarranty('shop', 0)).toBe('ไม่มีประกัน');
  });
});
