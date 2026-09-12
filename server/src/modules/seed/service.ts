// Sample data (PLAN.md Q10, sub-task 16): the first-run wizard can fill a new shop with a demo
// catalogue, and the owner can clear it again from the settings page.
//
// Every row the seed writes carries is_sample = 1, so clearing removes exactly those rows and never
// touches data the shop entered itself. Stock goes in through stockService.move() like any real goods
// receipt, so the ledger invariants hold for sample data too.

import { count, eq, inArray, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  addBangkokMonths,
  movingAverageCost,
  parseSpecs,
  type CategoryKind,
  type ClearSampleDataResult,
  type SampleDataCounts,
  type SampleDataStatus,
  type SessionUser,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  categories,
  goodsReceiptItems,
  goodsReceipts,
  productImages,
  productPriceHistory,
  productTags,
  products,
  serialItems,
  stockMovementSerials,
  stockMovements,
  suppliers,
  tags,
} from '../../db/schema';
import {
  SAMPLE_PRODUCTS,
  SAMPLE_SUPPLIERS,
  SAMPLE_TAGS,
  type SampleProduct,
} from '../../db/seed/sampleData';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict } from '../../lib/errors';
import { allocateDocNumber } from '../../services/numbering.service';
import * as stockService from '../../services/stock.service';

type Db = AppDatabase;
type Tx = stockService.Tx;
type DbOrTx = Db | Tx;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Shown in the notes of every sample row so it is recognisable inside the app. */
const SAMPLE_NOTE = 'ข้อมูลตัวอย่างสำหรับทดลองใช้งาน';

// ---------- create ----------

/**
 * Writes the whole sample catalogue. Must run inside a transaction (the first-run setup passes its own),
 * so a failure leaves no half-seeded shop.
 */
export function insertSampleData(tx: Tx, ownerId: number, now = Date.now()): SampleDataCounts {
  const categoryIds = new Map<CategoryKind, number>(
    tx
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .all()
      .map(({ kind, id }) => [kind, id]),
  );

  const supplierIds = SAMPLE_SUPPLIERS.map(
    (supplier) =>
      tx
        .insert(suppliers)
        .values({
          name: supplier.name,
          contactName: supplier.contactName,
          phone: supplier.phone,
          lineId: supplier.lineId,
          notes: SAMPLE_NOTE,
          isSample: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: suppliers.id })
        .get().id,
  );

  const tagIds = new Map(
    SAMPLE_TAGS.map((tag, index) => [
      tag.name,
      tx
        .insert(tags)
        .values({
          name: tag.name,
          color: tag.color,
          sortOrder: (index + 1) * 10,
          isSample: true,
          createdAt: now,
        })
        .returning({ id: tags.id })
        .get().id,
    ]),
  );

  const productIds = new Map<string, number>();
  for (const sample of SAMPLE_PRODUCTS) {
    const categoryId = categoryIds.get(sample.kind);
    if (categoryId === undefined) {
      throw new Error(`Sample data: no category for kind "${sample.kind}"`);
    }
    // A spec mistake in the seed data is a programming error; the seed test catches it.
    const specs = parseSpecs(sample.kind, sample.specs ?? {});
    if (!specs.ok) {
      throw new Error(
        `Sample data: bad specs on ${sample.sku}: ${specs.errors.map((e) => `${e.path} ${e.message}`).join(', ')}`,
      );
    }

    const id = tx
      .insert(products)
      .values({
        sku: sample.sku,
        barcode: sample.barcode ?? null,
        name: sample.name,
        brand: sample.brand,
        categoryId,
        description: sample.description ?? '',
        specs: specs.specs,
        condition: sample.condition ?? 'new',
        warrantyType: sample.warrantyType,
        warrantyMonths: sample.warrantyMonths,
        supplierWarrantyMonths: sample.supplierWarrantyMonths ?? sample.warrantyMonths,
        priceSatang: sample.priceSatang,
        regularPriceSatang: sample.regularPriceSatang ?? null,
        // The sample goods receipts below receive at exactly this cost, so the average matches.
        costSatang: sample.costSatang,
        trackStock: sample.trackStock ?? true,
        serialRequired: sample.serialRequired ?? false,
        minStock: sample.minStock ?? 0,
        notes: SAMPLE_NOTE,
        createdBy: ownerId,
        isSample: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: products.id })
      .get().id;
    productIds.set(sample.sku, id);

    insertSamplePriceHistory(tx, id, sample, ownerId, now);
    for (const tagName of sample.tags ?? []) {
      const tagId = tagIds.get(tagName);
      if (tagId === undefined) throw new Error(`Sample data: unknown tag "${tagName}"`);
      tx.insert(productTags).values({ productId: id, tagId }).run();
    }
  }

  let receiptCount = 0;
  // Oldest receipt first, so the document numbers run in date order.
  const bySupplier = [...SAMPLE_SUPPLIERS.entries()].sort((a, b) => b[1].daysAgo - a[1].daysAgo);
  for (const [index, supplier] of bySupplier) {
    const lines = SAMPLE_PRODUCTS.filter((p) => p.supplier === index && p.qty > 0);
    if (lines.length === 0) continue;
    receiveSample(tx, {
      supplierId: supplierIds[index]!,
      invoiceNo: supplier.invoiceNo,
      receivedAt: now - supplier.daysAgo * DAY_MS,
      lines,
      productIds,
      ownerId,
    });
    receiptCount += 1;
  }

  const counts: SampleDataCounts = {
    products: productIds.size,
    suppliers: supplierIds.length,
    tags: tagIds.size,
    goodsReceipts: receiptCount,
  };
  writeAudit(tx, { userId: ownerId, action: 'seed.create', detail: { ...counts } });
  return counts;
}

/**
 * Gives the demo a believable price history: a discounted product shows the old price and the reduction,
 * everything else shows the price it was created with.
 */
function insertSamplePriceHistory(
  tx: Tx,
  productId: number,
  sample: SampleProduct,
  ownerId: number,
  now: number,
) {
  if (sample.priceSatang === null) return;
  const entries =
    sample.regularPriceSatang === undefined
      ? [
          {
            priceSatang: sample.priceSatang,
            regularPriceSatang: null,
            changedAt: now - 30 * DAY_MS,
          },
        ]
      : [
          {
            priceSatang: sample.regularPriceSatang,
            regularPriceSatang: null,
            changedAt: now - 30 * DAY_MS,
          },
          {
            priceSatang: sample.priceSatang,
            regularPriceSatang: sample.regularPriceSatang,
            changedAt: now - 7 * DAY_MS,
          },
        ];
  for (const entry of entries) {
    tx.insert(productPriceHistory)
      .values({ productId, ...entry, changedBy: ownerId })
      .run();
  }
}

interface SampleReceiptInput {
  supplierId: number;
  invoiceNo: string;
  receivedAt: number;
  lines: SampleProduct[];
  productIds: Map<string, number>;
  ownerId: number;
}

/** One verified goods receipt per sample supplier; stock (and serial units) go in through the ledger. */
function receiveSample(tx: Tx, input: SampleReceiptInput) {
  const { receivedAt, ownerId } = input;
  const docNo = allocateDocNumber(tx, 'goods_receipt', receivedAt);
  const receiptId = tx
    .insert(goodsReceipts)
    .values({
      docNo,
      supplierId: input.supplierId,
      supplierInvoiceNo: input.invoiceNo,
      receivedAt,
      notes: SAMPLE_NOTE,
      status: 'posted',
      // Sample receipts belong to the owner, so their costs count as reviewed.
      costStatus: 'verified',
      costVerifiedBy: ownerId,
      costVerifiedAt: receivedAt,
      createdBy: ownerId,
      isSample: true,
      createdAt: receivedAt,
    })
    .returning({ id: goodsReceipts.id })
    .get().id;

  let totalCost = 0;
  for (const sample of input.lines) {
    const productId = input.productIds.get(sample.sku)!;
    const unitCost = sample.costSatang;
    const lineTotal = unitCost * sample.qty;
    const itemId = tx
      .insert(goodsReceiptItems)
      .values({
        goodsReceiptId: receiptId,
        productId,
        qty: sample.qty,
        unitCostSatang: unitCost,
        costSource: 'entered',
        lineTotalSatang: lineTotal,
      })
      .returning({ id: goodsReceiptItems.id })
      .get().id;

    const product = tx.select().from(products).where(eq(products.id, productId)).get()!;
    tx.update(products)
      .set({
        costSatang: movingAverageCost(product.onHand, product.costSatang, sample.qty, unitCost),
      })
      .where(eq(products.id, productId))
      .run();

    const supplierWarrantyMonths = product.supplierWarrantyMonths;
    const unitData = {
      unitCostSatang: unitCost,
      goodsReceiptItemId: itemId,
      supplierWarrantyExpiresAt:
        supplierWarrantyMonths > 0 ? addBangkokMonths(receivedAt, supplierWarrantyMonths) : null,
    };
    stockService.move(tx, {
      productId,
      qtyChange: sample.qty,
      type: 'receive',
      ref: { type: 'goods_receipt', id: receiptId, docNo },
      unitCostSatang: unitCost,
      userId: ownerId,
      newSerials: sampleSerialNumbers(sample).map((serialNo) => ({ serialNo, ...unitData })),
      now: receivedAt,
    });
    totalCost += lineTotal;
  }

  tx.update(goodsReceipts)
    .set({ totalCostSatang: totalCost })
    .where(eq(goodsReceipts.id, receiptId))
    .run();
}

/** e.g. CPU-0001-S01 … Unique per product, which is all the serial rules require. */
function sampleSerialNumbers(sample: SampleProduct): string[] {
  if (!sample.serialRequired) return [];
  return Array.from(
    { length: sample.qty },
    (_, index) => `${sample.sku}-S${String(index + 1).padStart(2, '0')}`,
  );
}

// ---------- status ----------

export function sampleDataStatus(db: DbOrTx): SampleDataStatus {
  const counts: SampleDataCounts = {
    products: sampleIds(db, products).length,
    suppliers: sampleIds(db, suppliers).length,
    tags: sampleIds(db, tags).length,
    goodsReceipts: sampleIds(db, goodsReceipts).length,
  };
  const hasSampleData = Object.values(counts).some((n) => n > 0);
  const blockedReason = hasSampleData ? blockingReason(db) : null;
  return {
    ...counts,
    hasSampleData,
    canClear: hasSampleData && blockedReason === null,
    blockedReason,
  };
}

type SampleTable = typeof products | typeof suppliers | typeof tags | typeof goodsReceipts;

function sampleIds(db: DbOrTx, table: SampleTable): number[] {
  return db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.isSample, true))
    .all()
    .map((row) => row.id);
}

/**
 * Sample data may only be cleared while it is untouched: every stock movement on a sample product must
 * come from a sample goods receipt, and every sample serial unit must still be in stock. That covers
 * sales, adjustments, builds and real receipts of a sample product (PLAN.md Q10: "before any sale").
 */
function blockingReason(db: DbOrTx): string | null {
  const [row] = db.all<{ movements: number; units: number }>(sql`
    select
      (select count(*) from ${stockMovements} m join ${products} p on p.id = m.product_id
        where p.is_sample = 1 and not (
          m.type = 'receive' and m.ref_type = 'goods_receipt'
          and m.ref_id in (select id from ${goodsReceipts} where is_sample = 1)
        )) as movements,
      (select count(*) from ${serialItems} s join ${products} p on p.id = s.product_id
        where p.is_sample = 1 and s.status <> 'in_stock') as units
  `);
  if (!row || (row.movements === 0 && row.units === 0)) return null;
  return 'ข้อมูลตัวอย่างถูกใช้งานแล้ว (มีการขาย ปรับสต็อก หรือรับสินค้าเข้าเพิ่ม) จึงลบทั้งชุดไม่ได้ กรุณาซ่อนสินค้าตัวอย่างที่ไม่ใช้ทีละรายการแทน';
}

// ---------- clear (owner) ----------

/**
 * Deletes the sample rows (PLAN.md Q10). Sample tags and suppliers that the shop also used for its own
 * data are kept and simply stop being sample data, because deleting them would take real data with them.
 */
export function clearSampleData(db: Db, actor: SessionUser): ClearSampleDataResult {
  const result = db.transaction((tx) => {
    const status = sampleDataStatus(tx);
    if (!status.hasSampleData) {
      throw badRequest('NO_SAMPLE_DATA', 'ไม่มีข้อมูลตัวอย่างในระบบแล้ว');
    }
    if (status.blockedReason) throw conflict('SAMPLE_DATA_IN_USE', status.blockedReason);

    const productIds = sampleIds(tx, products);
    const receiptIds = sampleIds(tx, goodsReceipts);
    const tagIds = sampleIds(tx, tags);
    const supplierIds = sampleIds(tx, suppliers);

    if (productIds.length) {
      const movementIds = tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(inArray(stockMovements.productId, productIds))
        .all()
        .map((row) => row.id);
      if (movementIds.length) {
        tx.delete(stockMovementSerials)
          .where(inArray(stockMovementSerials.movementId, movementIds))
          .run();
        tx.delete(stockMovements).where(inArray(stockMovements.id, movementIds)).run();
      }
      // Serial rows point at receipt items, so they go before the receipts.
      tx.delete(serialItems).where(inArray(serialItems.productId, productIds)).run();
    }
    if (receiptIds.length) {
      tx.delete(goodsReceiptItems)
        .where(inArray(goodsReceiptItems.goodsReceiptId, receiptIds))
        .run();
      tx.delete(goodsReceipts).where(inArray(goodsReceipts.id, receiptIds)).run();
    }
    if (productIds.length) {
      tx.delete(productPriceHistory)
        .where(inArray(productPriceHistory.productId, productIds))
        .run();
      tx.delete(productTags).where(inArray(productTags.productId, productIds)).run();
      tx.delete(productImages).where(inArray(productImages.productId, productIds)).run();
      tx.delete(products).where(inArray(products.id, productIds)).run();
    }

    // A sample tag the shop put on its own product, or a sample supplier it received real stock from,
    // is real data now: keep it and drop the sample flag instead of deleting it.
    const keptTags = tagIds.filter((id) => usageCount(tx, productTags, productTags.tagId, id) > 0);
    const keptSuppliers = supplierIds.filter(
      (id) => usageCount(tx, goodsReceipts, goodsReceipts.supplierId, id) > 0,
    );
    deleteOrKeep(tx, tags, tagIds, keptTags);
    deleteOrKeep(tx, suppliers, supplierIds, keptSuppliers);

    const cleared: SampleDataCounts = {
      products: productIds.length,
      suppliers: supplierIds.length - keptSuppliers.length,
      tags: tagIds.length - keptTags.length,
      goodsReceipts: receiptIds.length,
    };
    writeAudit(tx, {
      userId: actor.id,
      action: 'seed.clear',
      detail: { ...cleared, keptTags: keptTags.length, keptSuppliers: keptSuppliers.length },
    });
    return {
      cleared,
      kept: { tags: keptTags.length, suppliers: keptSuppliers.length },
      status: sampleDataStatus(tx),
    };
  });
  return result;
}

/** How many rows of `table` still reference `id` through `column`. */
function usageCount(
  tx: Tx,
  table: typeof productTags | typeof goodsReceipts,
  column: AnySQLiteColumn,
  id: number,
): number {
  return tx.select({ n: count() }).from(table).where(eq(column, id)).get()!.n;
}

function deleteOrKeep(
  tx: Tx,
  table: typeof tags | typeof suppliers,
  ids: number[],
  keep: number[],
) {
  const remove = ids.filter((id) => !keep.includes(id));
  if (remove.length) tx.delete(table).where(inArray(table.id, remove)).run();
  if (keep.length) {
    tx.update(table).set({ isSample: false }).where(inArray(table.id, keep)).run();
  }
}
