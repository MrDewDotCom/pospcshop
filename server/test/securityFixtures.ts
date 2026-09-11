// Seeds one of every entity type, with real cost data in every place cost can live, so the
// security tests (no cost leak, no money write) have something to leak.

import type { FastifyInstance } from 'fastify';
import { createStaff, patch, setUpShop, uploadImage, type TestClient } from './helpers';

async function ok(res: Promise<{ statusCode: number; body: string; json: () => unknown }>) {
  const r = await res;
  if (r.statusCode >= 300) throw new Error(`seed step failed (${r.statusCode}): ${r.body}`);
  return r.json() as Record<string, unknown> & { id: number };
}

export interface SeededShop {
  owner: TestClient;
  staff: TestClient;
  ids: {
    staffUser: number;
    tag: number;
    supplier: number;
    ram: number;
    cpu: number;
    awaitingPrice: number;
    archived: number;
    verifiedReceipt: number;
    unverifiedReceipt: number;
    voidedReceipt: number;
  };
  codes: { barcode: string; serial: string; adjustmentDocNo: string };
}

export async function seedEverything(app: FastifyInstance): Promise<SeededShop> {
  const { owner } = await setUpShop(app);
  const { staff, id: staffUser } = await createStaff(owner);

  const categories = (await owner.get('/api/categories')).json().items as {
    id: number;
    kind: string;
  }[];
  const categoryOf = (kind: string) => categories.find((c) => c.kind === kind)!.id;
  const tag = await ok(owner.post('/api/tags', { name: 'Open box', color: 'amber' }));
  const supplier = await ok(owner.post('/api/suppliers', { name: 'ซินเน็ค' }));
  const image = await uploadImage(owner);

  const base = {
    sku: '',
    brand: 'Brand',
    condition: 'new',
    warrantyType: 'distributor',
    warrantyMonths: 36,
    supplierWarrantyMonths: 36,
    trackStock: true,
    minStock: 2,
    notes: '',
    description: '',
  };
  const barcode = '8850000000017';
  const ram = await ok(
    owner.post('/api/products', {
      ...base,
      name: 'Kingston Fury 16GB',
      barcode,
      categoryId: categoryOf('other'),
      serialRequired: false,
      specs: {},
      imageFileIds: [image.id],
      pricing: { priceSatang: 1_890_00, costSatang: 1_500_00 },
    }),
  );
  // A price reduction, so the product has a regular price and a discount badge.
  await ok(owner.request('PUT', `/api/products/${ram.id}/pricing`, { priceSatang: 1_690_00 }));
  await ok(owner.request('PUT', `/api/products/${ram.id}/tags`, { tagIds: [tag.id] }));

  const cpu = await ok(
    owner.post('/api/products', {
      ...base,
      name: 'Ryzen 5 7600',
      barcode: '',
      categoryId: categoryOf('cpu'),
      serialRequired: true,
      specs: { socket: 'AM5', cores: 6 },
      pricing: { priceSatang: 6_990_00 },
    }),
  );
  const awaitingPrice = await ok(
    staff.post('/api/products', {
      ...base,
      name: 'รอตั้งราคา',
      barcode: '',
      categoryId: categoryOf('other'),
      serialRequired: false,
      specs: {},
    }),
  );
  await ok(patch(staff, `/api/products/${awaitingPrice.id}`, { description: 'ของใหม่' }));
  const archived = await ok(
    owner.post('/api/products', {
      ...base,
      name: 'เลิกขายแล้ว',
      barcode: '',
      categoryId: categoryOf('other'),
      serialRequired: false,
      specs: {},
      pricing: { priceSatang: 100_00, costSatang: 50_00 },
    }),
  );
  await ok(owner.post(`/api/products/${archived.id}/archive`));

  // Receipts: owner (verified), staff (unverified), staff then owner-verified, and a voided one.
  const verifiedReceipt = await ok(
    owner.post('/api/goods-receipts', {
      supplierId: supplier.id,
      supplierInvoiceNo: 'INV-1',
      lines: [
        { productId: ram.id, qty: 5, unitCostSatang: 1_400_00 },
        { productId: cpu.id, qty: 3, serials: ['S-1', 'S-2', 'S-3'], unitCostSatang: 6_000_00 },
      ],
    }),
  );
  const unverifiedReceipt = await ok(
    staff.post('/api/goods-receipts', {
      lines: [
        { productId: ram.id, qty: 2, unitCostSatang: 1_450_00 },
        { productId: cpu.id, qty: 1, serials: ['S-4'] },
      ],
    }),
  );
  const reviewed = await ok(
    staff.post('/api/goods-receipts', { lines: [{ productId: ram.id, qty: 1 }] }),
  );
  const reviewedLines = (await owner.get(`/api/goods-receipts/${reviewed.id}`)).json().lines as {
    id: number;
  }[];
  await ok(
    owner.post(`/api/goods-receipts/${reviewed.id}/verify-costs`, {
      lines: [{ itemId: reviewedLines[0]!.id, unitCostSatang: 1_420_00 }],
    }),
  );
  const voidedReceipt = await ok(
    owner.post('/api/goods-receipts', {
      lines: [{ productId: ram.id, qty: 1, unitCostSatang: 1 }],
    }),
  );
  await ok(owner.post(`/api/goods-receipts/${voidedReceipt.id}/void`, { reason: 'ผิด' }));

  // Adjustments: quantity in with a cost, and a serial unit written off.
  const cpuUnits = (await owner.get(`/api/products/${cpu.id}/serials`)).json().items as {
    id: number;
  }[];
  const adjustment = await ok(
    owner.post('/api/stock/adjustments', {
      reason: 'นับสต็อก',
      lines: [
        { productId: ram.id, qtyChange: 2, unitCostSatang: 1_500_00 },
        { productId: cpu.id, qtyChange: -1, serialIds: [cpuUnits[0]!.id] },
      ],
    }),
  );

  return {
    owner,
    staff,
    ids: {
      staffUser,
      tag: tag.id,
      supplier: supplier.id,
      ram: ram.id,
      cpu: cpu.id,
      awaitingPrice: awaitingPrice.id,
      archived: archived.id,
      verifiedReceipt: verifiedReceipt.id,
      unverifiedReceipt: unverifiedReceipt.id,
      voidedReceipt: voidedReceipt.id,
    },
    codes: { barcode, serial: 'S-2', adjustmentDocNo: adjustment.docNo as string },
  };
}
