import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  addBangkokMonths,
  averageAfterRemoval,
  can,
  correctedAverageCost,
  createGoodsReceiptInputSchema,
  movingAverageCost,
  normalizeScannedCode,
  voidInputSchema,
  type CostSource,
  type CreateGoodsReceiptInput,
  type ListGoodsReceiptsFilters,
  type Paginated,
  type SessionUser,
  type VerifyGoodsReceiptCostsInput,
  type VoidInput,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  goodsReceiptItems,
  goodsReceipts,
  products,
  serialItems,
  stockMovementSerials,
  stockMovements,
  suppliers,
  users,
} from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { contains } from '../../lib/sql';
import { toIso, toIsoOrNull } from '../../lib/time';
import { allocateDocNumber } from '../../services/numbering.service';
import * as stockService from '../../services/stock.service';

type Db = AppDatabase;
type DbOrTx = Pick<AppDatabase, 'select' | 'update'>;
type ReceiptRow = typeof goodsReceipts.$inferSelect;

// ---------- shaping (full/owner shape; routes narrow it for staff) ----------

export interface GoodsReceiptListItemFull {
  id: number;
  docNo: string;
  supplierId: number | null;
  supplierName: string | null;
  supplierInvoiceNo: string;
  receivedAt: string;
  status: ReceiptRow['status'];
  costStatus: ReceiptRow['costStatus'];
  lineCount: number;
  totalQty: number;
  createdByName: string | null;
  totalCostSatang: number;
}

export interface GoodsReceiptLineFull {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  qty: number;
  unitCostSatang: number;
  costSource: CostSource;
  lineTotalSatang: number;
  serials: { id: number; serialNo: string; status: (typeof serialItems.$inferSelect)['status'] }[];
}

export interface GoodsReceiptFull extends GoodsReceiptListItemFull {
  notes: string;
  createdAt: string;
  costVerifiedAt: string | null;
  costVerifiedByName: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  lines: GoodsReceiptLineFull[];
}

const creator = alias(users, 'creator');
const lineCountSql = sql<number>`(select count(*) from ${goodsReceiptItems} where ${goodsReceiptItems.goodsReceiptId} = ${goodsReceipts.id})`;
const totalQtySql = sql<number>`(select coalesce(sum(${goodsReceiptItems.qty}), 0) from ${goodsReceiptItems} where ${goodsReceiptItems.goodsReceiptId} = ${goodsReceipts.id})`;

function selectListItems(db: Db) {
  return db
    .select({
      receipt: goodsReceipts,
      supplierName: suppliers.name,
      createdByName: creator.name,
      lineCount: lineCountSql,
      totalQty: totalQtySql,
    })
    .from(goodsReceipts)
    .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
    .leftJoin(creator, eq(creator.id, goodsReceipts.createdBy));
}

type ListRow = Awaited<ReturnType<ReturnType<typeof selectListItems>['all']>>[number];

function toListItem(row: ListRow): GoodsReceiptListItemFull {
  const r = row.receipt;
  return {
    id: r.id,
    docNo: r.docNo,
    supplierId: r.supplierId,
    supplierName: row.supplierName,
    supplierInvoiceNo: r.supplierInvoiceNo,
    receivedAt: toIso(r.receivedAt),
    status: r.status,
    costStatus: r.costStatus,
    lineCount: row.lineCount,
    totalQty: row.totalQty,
    createdByName: row.createdByName,
    totalCostSatang: r.totalCostSatang,
  };
}

export function listGoodsReceipts(
  db: Db,
  query: ListGoodsReceiptsFilters,
): Paginated<GoodsReceiptListItemFull> {
  const filters: SQL[] = [];
  if (query.q) {
    filters.push(
      or(
        contains(goodsReceipts.docNo, query.q),
        contains(goodsReceipts.supplierInvoiceNo, query.q),
        contains(suppliers.name, query.q),
      )!,
    );
  }
  if (query.supplierId) filters.push(eq(goodsReceipts.supplierId, query.supplierId));
  if (query.status) filters.push(eq(goodsReceipts.status, query.status));
  if (query.costStatus) filters.push(eq(goodsReceipts.costStatus, query.costStatus));
  const where = and(...filters);

  const rows = selectListItems(db)
    .where(where)
    .orderBy(desc(goodsReceipts.receivedAt), desc(goodsReceipts.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db
    .select({ n: count() })
    .from(goodsReceipts)
    .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
    .where(where)
    .get()!.n;
  return { items: rows.map(toListItem), total };
}

export function getGoodsReceipt(db: Db, id: number): GoodsReceiptFull {
  const row = selectListItems(db).where(eq(goodsReceipts.id, id)).get();
  if (!row) throw notFound('ไม่พบใบรับสินค้านี้');
  const r = row.receipt;
  const nameOf = (userId: number | null) =>
    userId === null
      ? null
      : (db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ??
        null);

  const items = db
    .select({ item: goodsReceiptItems, productName: products.name, productSku: products.sku })
    .from(goodsReceiptItems)
    .innerJoin(products, eq(products.id, goodsReceiptItems.productId))
    .where(eq(goodsReceiptItems.goodsReceiptId, id))
    .orderBy(asc(goodsReceiptItems.id))
    .all();
  const serials = receivedSerials(db, id);

  return {
    ...toListItem(row),
    notes: r.notes,
    createdAt: toIso(r.createdAt),
    costVerifiedAt: toIsoOrNull(r.costVerifiedAt),
    costVerifiedByName: nameOf(r.costVerifiedBy),
    voidedAt: toIsoOrNull(r.voidedAt),
    voidedByName: nameOf(r.voidedBy),
    voidReason: r.voidReason,
    lines: items.map(({ item, productName, productSku }) => ({
      id: item.id,
      productId: item.productId,
      productName,
      productSku,
      qty: item.qty,
      unitCostSatang: item.unitCostSatang,
      costSource: item.costSource,
      lineTotalSatang: item.lineTotalSatang,
      serials: serials
        .filter((s) => s.productId === item.productId)
        .map(({ id: serialId, serialNo, status }) => ({ id: serialId, serialNo, status })),
    })),
  };
}

/**
 * Serial units a receipt brought in, found through its ledger rows. A unit keeps one row for life, so
 * after a void and a new receipt of the same unit, each receipt still lists it. (A receipt has at most
 * one line per product, so product id identifies the line.)
 */
function receivedSerials(db: DbOrTx, receiptId: number) {
  return db
    .select({
      id: serialItems.id,
      serialNo: serialItems.serialNo,
      status: serialItems.status,
      productId: stockMovements.productId,
    })
    .from(stockMovements)
    .innerJoin(stockMovementSerials, eq(stockMovementSerials.movementId, stockMovements.id))
    .innerJoin(serialItems, eq(serialItems.id, stockMovementSerials.serialItemId))
    .where(
      and(
        eq(stockMovements.refType, 'goods_receipt'),
        eq(stockMovements.refId, receiptId),
        eq(stockMovements.type, 'receive'),
      ),
    )
    .orderBy(asc(serialItems.id))
    .all();
}

// ---------- create (confirm receipt → stock in immediately) ----------

/**
 * Records a goods receipt and puts every line into stock in the same transaction. Staff may type the
 * supplier's cost, but their receipts stay "unverified" until the owner confirms the costs; the average
 * cost is updated provisionally right away (PLAN.md §7.2). A blank cost uses the current average.
 */
export function createGoodsReceipt(
  db: Db,
  actor: SessionUser,
  rawInput: CreateGoodsReceiptInput,
): GoodsReceiptFull {
  const input = createGoodsReceiptInputSchema.parse(rawInput);
  const verified = can(actor.role, 'goodsReceipt.verifyCost');
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw badRequest('DUPLICATE_PRODUCT_LINE', 'มีสินค้าซ้ำกันในใบรับ กรุณารวมเป็นรายการเดียว');
  }

  const id = db.transaction((tx) => {
    if (input.supplierId) {
      const supplier = tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).get();
      if (!supplier) throw badRequest('SUPPLIER_NOT_FOUND', 'ไม่พบผู้จำหน่ายที่เลือก');
      if (supplier.archivedAt) {
        throw badRequest('SUPPLIER_ARCHIVED', 'ผู้จำหน่ายนี้ถูกซ่อนอยู่ กรุณาเลือกผู้จำหน่ายอื่น');
      }
    }

    const now = Date.now();
    const docNo = allocateDocNumber(tx, 'goods_receipt', now);
    const receipt = tx
      .insert(goodsReceipts)
      .values({
        docNo,
        supplierId: input.supplierId ?? null,
        supplierInvoiceNo: input.supplierInvoiceNo,
        receivedAt: now,
        notes: input.notes,
        status: 'posted',
        costStatus: verified ? 'verified' : 'unverified',
        costVerifiedBy: verified ? actor.id : null,
        costVerifiedAt: verified ? now : null,
        createdBy: actor.id,
        createdAt: now,
      })
      .returning({ id: goodsReceipts.id })
      .get();

    let totalCost = 0;
    let totalQty = 0;
    input.lines.forEach((line, index) => {
      const product = tx.select().from(products).where(eq(products.id, line.productId)).get();
      if (!product) {
        throw badRequest('PRODUCT_NOT_FOUND', `ไม่พบสินค้าในรายการที่ ${index + 1}`);
      }
      const label = `"${product.name}"`;
      if (product.archivedAt) {
        throw badRequest('PRODUCT_ARCHIVED', `สินค้า ${label} ถูกซ่อนอยู่ รับเข้าไม่ได้`);
      }
      if (!product.trackStock) {
        throw badRequest('STOCK_NOT_TRACKED', `สินค้า ${label} ไม่ได้นับสต็อก รับเข้าไม่ได้`);
      }
      const serials = line.serials.map(normalizeScannedCode);
      if (new Set(serials.map((s) => s.toUpperCase())).size !== serials.length) {
        throw badRequest('SERIAL_DUPLICATE', `มีซีเรียลซ้ำกันในรายการสินค้า ${label}`);
      }
      if (product.serialRequired && serials.length !== line.qty) {
        throw badRequest(
          'SERIAL_COUNT_MISMATCH',
          `สินค้า ${label} ต้องสแกนซีเรียลให้ครบ ${line.qty} ชิ้น (ตอนนี้มี ${serials.length})`,
        );
      }

      const costSource: CostSource = line.unitCostSatang == null ? 'average' : 'entered';
      const unitCost = line.unitCostSatang ?? product.costSatang;
      const lineTotal = unitCost * line.qty;
      // The average uses the stock on hand *before* this line (earlier lines already moved it).
      tx.update(products)
        .set({
          costSatang: movingAverageCost(product.onHand, product.costSatang, line.qty, unitCost),
        })
        .where(eq(products.id, product.id))
        .run();

      const item = tx
        .insert(goodsReceiptItems)
        .values({
          goodsReceiptId: receipt.id,
          productId: product.id,
          qty: line.qty,
          unitCostSatang: unitCost,
          costSource,
          lineTotalSatang: lineTotal,
        })
        .returning({ id: goodsReceiptItems.id })
        .get();

      const warrantyExpiresAt =
        product.supplierWarrantyMonths > 0
          ? addBangkokMonths(now, product.supplierWarrantyMonths)
          : null;
      const unitData = {
        unitCostSatang: unitCost,
        goodsReceiptItemId: item.id,
        supplierWarrantyExpiresAt: warrantyExpiresAt,
      };
      // A unit that went back out through a voided receipt comes in again on its existing row.
      const { reuse, fresh } = stockService.splitInboundSerials(tx, product.id, serials, [
        'returned_to_supplier',
      ]);
      for (const unit of reuse) {
        tx.update(serialItems)
          .set({ ...unitData, receivedAt: now })
          .where(eq(serialItems.id, unit.id))
          .run();
      }
      stockService.move(tx, {
        productId: product.id,
        qtyChange: line.qty,
        type: 'receive',
        ref: { type: 'goods_receipt', id: receipt.id, docNo },
        unitCostSatang: unitCost,
        userId: actor.id,
        newSerials: fresh.map((serialNo) => ({ serialNo, ...unitData })),
        serials: reuse.length ? { ids: reuse.map((u) => u.id), status: 'in_stock' } : undefined,
        now,
      });
      totalCost += lineTotal;
      totalQty += line.qty;
    });

    tx.update(goodsReceipts)
      .set({ totalCostSatang: totalCost })
      .where(eq(goodsReceipts.id, receipt.id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'goods_receipt.create',
      entityType: 'goods_receipt',
      entityId: receipt.id,
      detail: { docNo, lines: input.lines.length, totalQty, verified },
    });
    return receipt.id;
  });
  return getGoodsReceipt(db, id);
}

function loadPostedReceipt(tx: DbOrTx, id: number) {
  const receipt = tx.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).get();
  if (!receipt) throw notFound('ไม่พบใบรับสินค้านี้');
  if (receipt.status === 'voided') throw conflict('RECEIPT_VOIDED', 'ใบรับสินค้านี้ถูกยกเลิกแล้ว');
  const items = tx
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.goodsReceiptId, id))
    .orderBy(asc(goodsReceiptItems.id))
    .all();
  return { receipt, items };
}

// ---------- owner cost review (PLAN.md §7.2) ----------

/**
 * The owner confirms or corrects every line's cost on an unverified receipt. A changed cost moves the
 * product's average for the units of that line still on hand (see correctedAverageCost); the serial
 * units get the final cost. Sales made in between keep their cost snapshot. Audited with before/after.
 */
export function verifyGoodsReceiptCosts(
  db: Db,
  actor: SessionUser,
  id: number,
  input: VerifyGoodsReceiptCostsInput,
): GoodsReceiptFull {
  db.transaction((tx) => {
    const { receipt, items } = loadPostedReceipt(tx, id);
    if (receipt.costStatus === 'verified') {
      throw conflict('ALREADY_VERIFIED', 'ใบรับสินค้านี้ตรวจสอบต้นทุนแล้ว');
    }
    const finalCosts = new Map(input.lines.map((l) => [l.itemId, l.unitCostSatang]));
    if (finalCosts.size !== input.lines.length || finalCosts.size !== items.length) {
      throw badRequest('LINES_MISMATCH', 'กรุณาตรวจสอบต้นทุนให้ครบทุกรายการในใบนี้');
    }
    if (items.some((item) => !finalCosts.has(item.id))) {
      throw badRequest('LINES_MISMATCH', 'มีรายการที่ไม่ได้อยู่ในใบรับสินค้านี้');
    }

    const serials = receivedSerials(tx, id);
    const changes: Record<string, unknown>[] = [];
    let totalCost = 0;
    for (const item of items) {
      const finalCost = finalCosts.get(item.id)!;
      totalCost += finalCost * item.qty;
      if (finalCost === item.unitCostSatang) continue;

      const product = tx.select().from(products).where(eq(products.id, item.productId)).get()!;
      const average = correctedAverageCost(
        product.onHand,
        product.costSatang,
        item.qty,
        item.unitCostSatang,
        finalCost,
      );
      tx.update(products).set({ costSatang: average }).where(eq(products.id, product.id)).run();
      tx.update(goodsReceiptItems)
        .set({ unitCostSatang: finalCost, lineTotalSatang: finalCost * item.qty })
        .where(eq(goodsReceiptItems.id, item.id))
        .run();
      const unitIds = serials.filter((s) => s.productId === item.productId).map((s) => s.id);
      if (unitIds.length) {
        tx.update(serialItems)
          .set({ unitCostSatang: finalCost })
          .where(inArray(serialItems.id, unitIds))
          .run();
      }
      changes.push({
        productId: product.id,
        sku: product.sku,
        cost: { from: item.unitCostSatang, to: finalCost },
        average: { from: product.costSatang, to: average },
      });
    }

    const now = Date.now();
    tx.update(goodsReceipts)
      .set({
        costStatus: 'verified',
        costVerifiedBy: actor.id,
        costVerifiedAt: now,
        totalCostSatang: totalCost,
      })
      .where(eq(goodsReceipts.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'goods_receipt.cost_verify',
      entityType: 'goods_receipt',
      entityId: id,
      detail: { docNo: receipt.docNo, changes },
    });
  });
  return getGoodsReceipt(db, id);
}

// ---------- void (owner) ----------

/**
 * Voids a receipt: every line's stock goes back out (`void` movements with the reason), serial units
 * become "returned to supplier" (they can be received again later), and the average is reversed when
 * the result makes sense. Only possible while the stock from this receipt is still all here.
 */
export function voidGoodsReceipt(
  db: Db,
  actor: SessionUser,
  id: number,
  input: VoidInput,
): GoodsReceiptFull {
  const reason = voidInputSchema.parse(input).reason;
  db.transaction((tx) => {
    const { receipt, items } = loadPostedReceipt(tx, id);
    const serials = receivedSerials(tx, id);
    const averages: Record<string, unknown>[] = [];

    for (const item of items) {
      const product = tx.select().from(products).where(eq(products.id, item.productId)).get()!;
      const label = `"${product.name}"`;
      const unitIds = serials.filter((s) => s.productId === item.productId);
      const used = product.serialRequired
        ? unitIds.some((s) => s.status !== 'in_stock')
        : product.onHand < item.qty;
      if (used) {
        throw conflict(
          'RECEIPT_STOCK_USED',
          `สินค้า ${label} จากใบนี้ถูกขายหรือนำไปใช้แล้ว ยกเลิกใบรับสินค้านี้ไม่ได้ (ให้ปรับสต็อกแทน)`,
        );
      }

      const reversed = averageAfterRemoval(
        product.onHand,
        product.costSatang,
        item.qty,
        item.unitCostSatang,
      );
      if (reversed !== null) {
        tx.update(products).set({ costSatang: reversed }).where(eq(products.id, product.id)).run();
      }
      averages.push({
        productId: product.id,
        sku: product.sku,
        from: product.costSatang,
        to: reversed ?? product.costSatang,
        kept: reversed === null,
      });

      stockService.move(tx, {
        productId: product.id,
        qtyChange: -item.qty,
        type: 'void',
        ref: { type: 'goods_receipt', id, docNo: receipt.docNo },
        unitCostSatang: item.unitCostSatang,
        reason,
        userId: actor.id,
        serials: product.serialRequired
          ? { ids: unitIds.map((s) => s.id), status: 'returned_to_supplier' }
          : undefined,
      });
    }

    tx.update(goodsReceipts)
      .set({ status: 'voided', voidedAt: Date.now(), voidedBy: actor.id, voidReason: reason })
      .where(eq(goodsReceipts.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'goods_receipt.void',
      entityType: 'goods_receipt',
      entityId: id,
      detail: { docNo: receipt.docNo, reason, averages },
    });
  });
  return getGoodsReceipt(db, id);
}
