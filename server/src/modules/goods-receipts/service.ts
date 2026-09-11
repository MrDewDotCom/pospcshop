import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  addBangkokMonths,
  can,
  createGoodsReceiptInputSchema,
  movingAverageCost,
  normalizeScannedCode,
  type CostSource,
  type CreateGoodsReceiptInput,
  type ListGoodsReceiptsFilters,
  type Paginated,
  type SessionUser,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  goodsReceiptItems,
  goodsReceipts,
  products,
  serialItems,
  suppliers,
  users,
} from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { contains } from '../../lib/sql';
import { toIso, toIsoOrNull } from '../../lib/time';
import { allocateDocNumber } from '../../services/numbering.service';
import * as stockService from '../../services/stock.service';

type Db = AppDatabase;
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
  const serials = items.length
    ? db
        .select({
          id: serialItems.id,
          serialNo: serialItems.serialNo,
          status: serialItems.status,
          itemId: serialItems.goodsReceiptItemId,
        })
        .from(serialItems)
        .where(
          inArray(
            serialItems.goodsReceiptItemId,
            items.map((i) => i.item.id),
          ),
        )
        .orderBy(asc(serialItems.id))
        .all()
    : [];

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
        .filter((s) => s.itemId === item.id)
        .map(({ id: serialId, serialNo, status }) => ({ id: serialId, serialNo, status })),
    })),
  };
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
      stockService.move(tx, {
        productId: product.id,
        qtyChange: line.qty,
        type: 'receive',
        ref: { type: 'goods_receipt', id: receipt.id, docNo },
        unitCostSatang: unitCost,
        userId: actor.id,
        newSerials: serials.map((serialNo) => ({
          serialNo,
          unitCostSatang: unitCost,
          goodsReceiptItemId: item.id,
          supplierWarrantyExpiresAt: warrantyExpiresAt,
        })),
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
