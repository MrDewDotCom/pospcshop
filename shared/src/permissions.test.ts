import { describe, expect, it } from 'vitest';
import { can, findForbiddenKeys, permissionsFor } from './permissions';

describe('permissions', () => {
  it('keeps money and admin actions owner-only', () => {
    for (const permission of [
      'cost.view',
      'product.editPricing',
      'product.editCore',
      'goodsReceipt.verifyCost',
      'stock.adjust',
      'sale.void',
      'return.editRefund',
      'build.editPricing',
      'settings.manage',
      'users.manage',
      'backup.manage',
    ] as const) {
      expect(can('owner', permission), permission).toBe(true);
      expect(can('staff', permission), permission).toBe(false);
    }
  });

  it('lets staff do day-to-day work', () => {
    for (const permission of [
      'product.create',
      'product.editDetails',
      'goodsReceipt.create',
      'sale.create',
      'return.create',
      'return.resolve',
      'build.edit',
    ] as const) {
      expect(can('staff', permission), permission).toBe(true);
    }
  });

  it('gives the owner every permission', () => {
    expect(permissionsFor('owner').length).toBeGreaterThan(permissionsFor('staff').length);
    expect(permissionsFor('staff').every((p) => can('owner', p))).toBe(true);
  });
});

describe('findForbiddenKeys', () => {
  it('finds cost keys at any depth, including inside arrays', () => {
    const response = {
      items: [
        { id: 1, name: 'CPU', priceSatang: 100 },
        { id: 2, name: 'GPU', costSatang: 50, serials: [{ serialNo: 'A', unitCostSatang: 50 }] },
      ],
      summary: { totalCostSatang: 50 },
    };
    expect(findForbiddenKeys(response)).toEqual([
      '$.items[1].costSatang',
      '$.items[1].serials[0].unitCostSatang',
      '$.summary.totalCostSatang',
    ]);
  });

  it('returns nothing for a clean response', () => {
    expect(
      findForbiddenKeys({ items: [{ priceSatang: 1, regularPriceSatang: 2 }], total: 1 }),
    ).toEqual([]);
    expect(findForbiddenKeys(null)).toEqual([]);
  });
});
