import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  allocateRefund,
  createReturnInputSchema,
  formatBaht,
  movingAverageCost,
  resolveReturnItemInputSchema,
  updateReturnRefundInputSchema,
  type CreateReturnInput,
  type ResolvedReturnDisposition,
  type ResolveReturnItemInput,
  type SaleReturn,
  type SessionUser,
  type UpdateReturnRefundInput,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  products,
  saleItemSerials,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  serialItems,
  users,
} from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { toIso, toIsoOrNull } from '../../lib/time';
import { allocateDocNumber } from '../../services/numbering.service';
import * as stockService from '../../services/stock.service';
import { selectReturnListItems, toReturnListItem } from './queries';

type Db = AppDatabase;
type DbOrTx = Pick<AppDatabase, 'select'>;

/** The full (owner) shape; routes narrow it for staff with respondByRole. */
export type SaleReturnFull = SaleReturn & {
  lines: (SaleReturn['lines'][number] & { unitCostSatang: number })[];
};

const RETURN_NOT_FOUND = () => notFound('ไม่พบใบคืนสินค้านี้');

// ---------- read ----------

export function getReturn(db: DbOrTx, id: number): SaleReturnFull {
  const row = selectReturnListItems(db).where(eq(saleReturns.id, id)).get();
  if (!row) throw RETURN_NOT_FOUND();
  const r = row.ret;
  const resolver = alias(users, 'resolver');
  const items = db
    .select({
      item: saleReturnItems,
      name: saleItems.nameSnapshot,
      sku: saleItems.skuSnapshot,
      unitPriceSatang: saleItems.unitPriceSatang,
      serialNo: serialItems.serialNo,
      resolvedByName: resolver.name,
    })
    .from(saleReturnItems)
    .innerJoin(saleItems, eq(saleItems.id, saleReturnItems.saleItemId))
    .leftJoin(serialItems, eq(serialItems.id, saleReturnItems.serialItemId))
    .leftJoin(resolver, eq(resolver.id, saleReturnItems.resolvedBy))
    .where(eq(saleReturnItems.returnId, id))
    .orderBy(asc(saleReturnItems.id))
    .all();
  const adjustedByName =
    r.refundAdjustedBy === null
      ? null
      : (db.select({ name: users.name }).from(users).where(eq(users.id, r.refundAdjustedBy)).get()
          ?.name ?? null);

  return {
    ...toReturnListItem(row),
    saleSoldAt: toIso(row.saleSoldAt),
    createdAt: toIso(r.createdAt),
    maxRefundSatang: items.reduce((sum, i) => sum + i.unitPriceSatang * i.item.qty, 0),
    refundAdjustedAt: toIsoOrNull(r.refundAdjustedAt),
    refundAdjustedByName: adjustedByName,
    lines: items.map(({ item, name, sku, serialNo, resolvedByName }) => ({
      id: item.id,
      saleItemId: item.saleItemId,
      productId: item.productId,
      productName: name,
      productSku: sku,
      qty: item.qty,
      serialItemId: item.serialItemId,
      serialNo,
      refundSatang: item.refundSatang,
      unitCostSatang: item.unitCostSatang,
      disposition: item.disposition,
      resolvedAt: toIsoOrNull(item.resolvedAt),
      resolvedByName,
      resolutionNote: item.resolutionNote,
    })),
  };
}

// ---------- create (PLAN.md §7.8) ----------

/**
 * Records a customer return against a sale. Returned units go into quarantine: serial units become
 * "customer_returned" and every line starts `pending`. Sellable stock does NOT change here (Q8/P16);
 * restocking, claiming, or writing off is a separate, explicit decision. The refund is computed from
 * the sale's snapshot (what the customer paid for those units); the request carries no money (P21).
 */
export function createReturn(
  db: Db,
  actor: SessionUser,
  saleId: number,
  rawInput: CreateReturnInput,
): SaleReturnFull {
  const input = createReturnInputSchema.parse(rawInput);
  const lineIds = input.lines.map((l) => l.saleItemId);
  if (new Set(lineIds).size !== lineIds.length) {
    throw badRequest('DUPLICATE_RETURN_LINE', 'มีรายการซ้ำกัน กรุณารวมเป็นรายการเดียว');
  }

  const id = db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.id, saleId)).get();
    if (!sale) throw notFound('ไม่พบบิลขายนี้');
    if (sale.status === 'voided') {
      throw conflict('SALE_VOIDED', 'บิลนี้ถูกยกเลิกแล้ว รับคืนสินค้าไม่ได้');
    }

    const prepared = input.lines.map((line) => {
      const found = tx
        .select({ item: saleItems, trackStock: products.trackStock })
        .from(saleItems)
        .leftJoin(products, eq(products.id, saleItems.productId))
        .where(and(eq(saleItems.id, line.saleItemId), eq(saleItems.saleId, saleId)))
        .get();
      if (!found || found.item.productId === null) {
        throw badRequest('SALE_ITEM_NOT_FOUND', 'ไม่พบรายการนี้ในบิลขาย');
      }
      const { item } = found;
      const label = `"${item.nameSnapshot}"`;
      if (!found.trackStock) {
        throw badRequest(
          'NOT_RETURNABLE',
          `รายการ ${label} เป็นบริการหรือสินค้าที่ไม่นับสต็อก รับคืนไม่ได้`,
        );
      }
      const left = item.qty - item.returnedQty;
      if (line.qty > left) {
        throw badRequest(
          'RETURN_QTY_TOO_HIGH',
          left > 0
            ? `รายการ ${label} คืนได้อีกไม่เกิน ${left.toLocaleString('th-TH')} ชิ้น`
            : `รายการ ${label} คืนครบแล้ว`,
        );
      }

      const soldUnits = tx
        .select({ id: saleItemSerials.serialItemId })
        .from(saleItemSerials)
        .where(eq(saleItemSerials.saleItemId, item.id))
        .all()
        .map((u) => u.id);
      const serialIds = [...new Set(line.serialItemIds)];
      if (soldUnits.length > 0) {
        if (serialIds.length !== line.qty) {
          throw badRequest(
            'SERIAL_COUNT_MISMATCH',
            `รายการ ${label} ต้องเลือกซีเรียลที่คืนให้ครบ ${line.qty} ชิ้น`,
          );
        }
        const alreadyBack = serialIds.length
          ? tx
              .select({ id: saleReturnItems.serialItemId })
              .from(saleReturnItems)
              .where(
                and(
                  eq(saleReturnItems.saleItemId, item.id),
                  inArray(saleReturnItems.serialItemId, serialIds),
                ),
              )
              .all()
          : [];
        if (serialIds.some((s) => !soldUnits.includes(s)) || alreadyBack.length > 0) {
          throw badRequest(
            'SERIAL_NOT_RETURNABLE',
            `ซีเรียลที่เลือกของรายการ ${label} ไม่ได้ขายในบิลนี้ หรือคืนไปแล้ว`,
          );
        }
      } else if (serialIds.length) {
        throw badRequest('SERIAL_NOT_TRACKED', `รายการ ${label} ไม่ได้บันทึกซีเรียล`);
      }
      return { item, qty: line.qty, serialIds };
    });

    const refunding = input.refundMethod !== 'none';
    const lineRefund = (p: (typeof prepared)[number]) =>
      refunding ? p.item.unitPriceSatang * p.qty : 0;
    const refundTotal = prepared.reduce((sum, p) => sum + lineRefund(p), 0);

    const now = Date.now();
    const docNo = allocateDocNumber(tx, 'return', now);
    const ret = tx
      .insert(saleReturns)
      .values({
        docNo,
        saleId,
        returnedAt: now,
        reason: input.reason,
        refundMethod: input.refundMethod,
        refundSatang: refundTotal,
        createdBy: actor.id,
        createdAt: now,
      })
      .returning({ id: saleReturns.id })
      .get();

    for (const p of prepared) {
      const common = {
        returnId: ret.id,
        saleItemId: p.item.id,
        productId: p.item.productId!,
        unitCostSatang: p.item.unitCostSatang,
      };
      // One row per physical unit for serial products, so each can be resolved on its own.
      const rows = p.serialIds.length
        ? p.serialIds.map((serialItemId) => ({
            ...common,
            qty: 1,
            serialItemId,
            refundSatang: refunding ? p.item.unitPriceSatang : 0,
          }))
        : [{ ...common, qty: p.qty, serialItemId: null, refundSatang: lineRefund(p) }];
      tx.insert(saleReturnItems).values(rows).run();
      tx.update(saleItems)
        .set({ returnedQty: sql`${saleItems.returnedQty} + ${p.qty}` })
        .where(eq(saleItems.id, p.item.id))
        .run();
      // Not a stock change (the units weren't in stock): they're back in the shop but quarantined.
      if (p.serialIds.length) {
        tx.update(serialItems)
          .set({ status: 'customer_returned' })
          .where(inArray(serialItems.id, p.serialIds))
          .run();
      }
    }

    tx.update(sales)
      .set({ refundedSatang: sql`${sales.refundedSatang} + ${refundTotal}` })
      .where(eq(sales.id, saleId))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'return.create',
      entityType: 'sale_return',
      entityId: ret.id,
      detail: {
        docNo,
        saleDocNo: sale.docNo,
        reason: input.reason,
        refundMethod: input.refundMethod,
        refundSatang: refundTotal,
        units: prepared.reduce((sum, p) => sum + p.qty, 0),
      },
    });
    return ret.id;
  });
  return getReturn(db, id);
}

// ---------- resolve a returned unit (PLAN.md §7.8) ----------

const RESOLVE_LABELS: Record<ResolvedReturnDisposition, string> = {
  restocked: 'คืนเข้าสต็อก',
  sent_to_claim: 'ส่งเคลม',
  written_off: 'ตัดจำหน่าย',
};

/**
 * The explicit decision that takes a returned line out of quarantine (staff or owner):
 * - restocked → back into sellable stock (`return_restock` movement, the average takes the units back
 *   at their sale cost); a serial unit returns to in stock marked "was returned".
 * - sent_to_claim → the serial unit is "in claim" (the claim itself arrives in Phase 5); no stock change.
 * - written_off → nothing re-enters stock; a serial unit is written off.
 */
export function resolveReturnItem(
  db: Db,
  actor: SessionUser,
  returnId: number,
  itemId: number,
  rawInput: ResolveReturnItemInput,
): SaleReturnFull {
  const { disposition, note } = resolveReturnItemInputSchema.parse(rawInput);
  db.transaction((tx) => {
    const ret = tx.select().from(saleReturns).where(eq(saleReturns.id, returnId)).get();
    if (!ret) throw RETURN_NOT_FOUND();
    const item = tx
      .select()
      .from(saleReturnItems)
      .where(and(eq(saleReturnItems.id, itemId), eq(saleReturnItems.returnId, returnId)))
      .get();
    if (!item) throw notFound('ไม่พบรายการนี้ในใบคืนสินค้า');
    if (item.disposition !== 'pending') {
      throw conflict('ALREADY_RESOLVED', 'รายการนี้จัดการไปแล้ว');
    }

    const now = Date.now();
    if (disposition === 'restocked') {
      const product = tx.select().from(products).where(eq(products.id, item.productId)).get()!;
      tx.update(products)
        .set({
          costSatang: movingAverageCost(
            product.onHand,
            product.costSatang,
            item.qty,
            item.unitCostSatang,
          ),
        })
        .where(eq(products.id, product.id))
        .run();
      stockService.move(tx, {
        productId: product.id,
        qtyChange: item.qty,
        type: 'return_restock',
        ref: { type: 'sale_return', id: returnId, docNo: ret.docNo },
        unitCostSatang: item.unitCostSatang,
        reason: note || null,
        userId: actor.id,
        serials: item.serialItemId ? { ids: [item.serialItemId], status: 'in_stock' } : undefined,
        now,
      });
      if (item.serialItemId) {
        tx.update(serialItems)
          .set({ wasReturned: true })
          .where(eq(serialItems.id, item.serialItemId))
          .run();
      }
    } else if (item.serialItemId) {
      // Not a stock change: the unit never re-entered sellable stock.
      tx.update(serialItems)
        .set({ status: disposition === 'sent_to_claim' ? 'in_claim' : 'written_off' })
        .where(eq(serialItems.id, item.serialItemId))
        .run();
    }

    tx.update(saleReturnItems)
      .set({ disposition, resolvedAt: now, resolvedBy: actor.id, resolutionNote: note })
      .where(eq(saleReturnItems.id, itemId))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'return.resolve',
      entityType: 'sale_return',
      entityId: returnId,
      detail: {
        docNo: ret.docNo,
        itemId,
        productId: item.productId,
        qty: item.qty,
        serialItemId: item.serialItemId,
        disposition,
        decision: RESOLVE_LABELS[disposition],
        note,
      },
    });
  });
  return getReturn(db, returnId);
}

// ---------- owner refund override (P21) ----------

/**
 * The owner corrects a return's refund (e.g. a deduction for a missing box). It can't exceed what the
 * customer paid for the returned units; the amount is split back over the lines in proportion.
 */
export function updateReturnRefund(
  db: Db,
  actor: SessionUser,
  id: number,
  rawInput: UpdateReturnRefundInput,
): SaleReturnFull {
  const { refundSatang } = updateReturnRefundInputSchema.parse(rawInput);
  db.transaction((tx) => {
    const ret = tx.select().from(saleReturns).where(eq(saleReturns.id, id)).get();
    if (!ret) throw RETURN_NOT_FOUND();
    if (ret.refundMethod === 'none') {
      throw badRequest('NO_REFUND', 'ใบคืนนี้เลือก "ไม่คืนเงิน" ไว้ แก้ยอดคืนเงินไม่ได้');
    }
    const items = tx
      .select({
        id: saleReturnItems.id,
        qty: saleReturnItems.qty,
        price: saleItems.unitPriceSatang,
      })
      .from(saleReturnItems)
      .innerJoin(saleItems, eq(saleItems.id, saleReturnItems.saleItemId))
      .where(eq(saleReturnItems.returnId, id))
      .orderBy(asc(saleReturnItems.id))
      .all();
    const values = items.map((i) => i.price * i.qty);
    const max = values.reduce((a, b) => a + b, 0);
    if (refundSatang > max) {
      throw badRequest(
        'REFUND_TOO_HIGH',
        `คืนเงินได้ไม่เกิน ฿${formatBaht(max)} (ราคาที่ลูกค้าจ่ายสำหรับสินค้าที่คืน)`,
      );
    }

    const shares = allocateRefund(refundSatang, values);
    items.forEach((item, index) =>
      tx
        .update(saleReturnItems)
        .set({ refundSatang: shares[index] })
        .where(eq(saleReturnItems.id, item.id))
        .run(),
    );
    const now = Date.now();
    tx.update(saleReturns)
      .set({ refundSatang, refundAdjustedBy: actor.id, refundAdjustedAt: now })
      .where(eq(saleReturns.id, id))
      .run();
    tx.update(sales)
      .set({ refundedSatang: sql`${sales.refundedSatang} + ${refundSatang - ret.refundSatang}` })
      .where(eq(sales.id, ret.saleId))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'return.refund_change',
      entityType: 'sale_return',
      entityId: id,
      detail: { docNo: ret.docNo, from: ret.refundSatang, to: refundSatang },
    });
  });
  return getReturn(db, id);
}
