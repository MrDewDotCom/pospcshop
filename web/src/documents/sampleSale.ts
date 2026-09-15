import { baht, THAI_RENDER_TEST, type Sale } from '@pcshop/shared';

/**
 * A made-up sale for the "sample receipt" preview in the shop settings. Its first line uses the Thai
 * rendering test string (stacked vowels and tone marks), so every export path can be checked with it
 * (CLAUDE.md rule 12). Nothing here is saved.
 */
export function sampleSale(now = Date.now()): Sale {
  const iso = new Date(now).toISOString();
  const line = {
    kind: 'product' as const,
    parentItemId: null,
    productId: null,
    returnedQty: 0,
    serialRequired: false,
    serials: [],
  };
  return {
    id: 0,
    docNo: 'RC0000-0000',
    soldAt: iso,
    createdAt: iso,
    status: 'paid',
    source: 'pos',
    customerId: null,
    customerName: 'คุณสมชาย ใจดี',
    customerPhone: '081-234-5678',
    totalSatang: baht(1590 + 2 * 290 + 300),
    savingsSatang: baht(200),
    refundedSatang: 0,
    itemCount: 4,
    paymentMethod: 'cash',
    salespersonId: null,
    salespersonName: 'พนักงาน ตัวอย่าง',
    returnCount: 0,
    note: '',
    voidedAt: null,
    voidedByName: null,
    voidReason: null,
    payment: {
      id: 0,
      method: 'cash',
      amountSatang: baht(2470),
      receivedSatang: baht(2500),
      changeSatang: baht(30),
      paidAt: iso,
      receivedByName: null,
      voidedAt: null,
    },
    returns: [],
    lines: [
      {
        ...line,
        id: 1,
        name: `${THAI_RENDER_TEST} (ทดสอบภาษาไทย)`,
        sku: 'PSU-0001',
        qty: 1,
        unitPriceSatang: baht(1590),
        regularPriceSatang: baht(1790),
        lineTotalSatang: baht(1590),
        warrantyType: 'distributor',
        warrantyMonths: 36,
        serialRequired: true,
        serials: [{ id: 1, serialNo: 'SN-TEST-0001', returned: false, warrantyExpiresAt: null }],
      },
      {
        ...line,
        id: 2,
        name: 'สาย SATA 3.0 (มือสอง)',
        sku: 'ACC-0001',
        qty: 2,
        unitPriceSatang: baht(290),
        regularPriceSatang: null,
        lineTotalSatang: baht(580),
        warrantyType: 'shop',
        warrantyMonths: 6,
      },
      {
        ...line,
        id: 3,
        kind: 'service',
        name: 'ค่าบริการติดตั้ง',
        sku: 'SVC-0001',
        qty: 1,
        unitPriceSatang: baht(300),
        regularPriceSatang: null,
        lineTotalSatang: baht(300),
        warrantyType: 'none',
        warrantyMonths: 0,
      },
    ],
  };
}
