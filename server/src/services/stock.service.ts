// The stock ledger (PLAN.md §7.1). `move()` is the ONLY code allowed to change stock: it writes the
// ledger row, updates the products.on_hand cache, and moves serial units in and out of stock.
//
// Invariants kept here:
//   products.on_hand = SUM(stock_movements.qty_change)
//   serial products: on_hand = COUNT(serial_items WHERE status = 'in_stock')
//   no negative stock unless the shop allows it; serial stock can never go negative.
//
// Callers pass the open transaction (`Tx`, which the root database object doesn't satisfy), so a stock
// change is always committed or rolled back together with the document that caused it. better-sqlite3
// transactions are synchronous: never await inside one.

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SerialStatus, StockMovementType } from '@pcshop/shared';
import type { AppDatabase } from '../db/client';
import {
  products,
  serialItems,
  shopSettings,
  stockMovementSerials,
  stockMovements,
} from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';

export type Tx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

export interface NewSerialUnit {
  serialNo: string;
  /** Actual cost of this unit (owner-only data). */
  unitCostSatang: number;
  goodsReceiptItemId?: number | null;
  supplierWarrantyExpiresAt?: number | null;
}

export interface StockMoveInput {
  productId: number;
  /** Positive = into sellable stock, negative = out of it. Never 0. */
  qtyChange: number;
  type: StockMovementType;
  /** The document that caused the movement (adjustments have a doc number but no row of their own). */
  ref?: { type: string; id?: number | null; docNo?: string | null };
  unitCostSatang?: number | null;
  /** Required by callers for adjustments and voids. */
  reason?: string | null;
  userId: number | null;
  /** Inbound, serial-tracked: units to create. They start as `in_stock`. */
  newSerials?: NewSerialUnit[];
  /**
   * Existing units that move. Inbound (qtyChange > 0): each becomes `in_stock` (status must be
   * 'in_stock'). Outbound: each must be `in_stock` now and gets `status` (e.g. 'sold', 'written_off').
   */
  serials?: { ids: number[]; status: SerialStatus };
  now?: number;
}

export interface StockMoveResult {
  movementId: number;
  balanceAfter: number;
  /** Every serial unit in the movement (created or existing). */
  serialIds: number[];
}

function allowNegativeStock(tx: Tx): boolean {
  return tx.select({ v: shopSettings.allowNegativeStock }).from(shopSettings).get()?.v ?? false;
}

export function move(tx: Tx, input: StockMoveInput): StockMoveResult {
  const { productId, qtyChange } = input;
  if (!Number.isSafeInteger(qtyChange) || qtyChange === 0) {
    throw new RangeError(`qtyChange must be a non-zero integer, got ${qtyChange}`);
  }
  const product = tx.select().from(products).where(eq(products.id, productId)).get();
  if (!product) throw notFound('ไม่พบสินค้านี้');
  const label = `"${product.name}"`;
  if (!product.trackStock) {
    throw badRequest('STOCK_NOT_TRACKED', `สินค้า ${label} ไม่ได้นับสต็อก`);
  }

  const newSerials = input.newSerials ?? [];
  const existingIds = [...new Set(input.serials?.ids ?? [])];
  const now = input.now ?? Date.now();

  if (!product.serialRequired) {
    if (newSerials.length || existingIds.length) {
      throw badRequest('SERIAL_NOT_TRACKED', `สินค้า ${label} ไม่ได้บันทึกซีเรียล`);
    }
  } else if (qtyChange > 0) {
    if (existingIds.length && input.serials!.status !== 'in_stock') {
      throw new Error('Inbound serials must move to in_stock');
    }
    if (newSerials.length + existingIds.length !== qtyChange) {
      throw badRequest(
        'SERIAL_COUNT_MISMATCH',
        `สินค้า ${label} ต้องระบุซีเรียลให้ครบ ${qtyChange} ชิ้น`,
      );
    }
    assertNewSerialsFree(tx, productId, label, newSerials);
    assertSerialsOf(
      tx,
      productId,
      existingIds,
      (status) => status !== 'in_stock',
      () => conflict('SERIAL_ALREADY_IN_STOCK', `ซีเรียลบางตัวของสินค้า ${label} อยู่ในสต็อกแล้ว`),
    );
  } else {
    if (newSerials.length) throw new Error('New serials can only be created by inbound movements');
    if (existingIds.length && input.serials!.status === 'in_stock') {
      throw new Error('Outbound serials cannot stay in_stock');
    }
    if (existingIds.length !== -qtyChange) {
      throw badRequest(
        'SERIAL_COUNT_MISMATCH',
        `สินค้า ${label} ต้องเลือกซีเรียลให้ครบ ${-qtyChange} ชิ้น`,
      );
    }
    assertSerialsOf(
      tx,
      productId,
      existingIds,
      (status) => status === 'in_stock',
      () => conflict('SERIAL_NOT_IN_STOCK', `ซีเรียลบางตัวของสินค้า ${label} ไม่ได้อยู่ในสต็อก`),
    );
  }

  const balanceAfter = product.onHand + qtyChange;
  if (balanceAfter < 0 && (product.serialRequired || !allowNegativeStock(tx))) {
    throw conflict(
      'INSUFFICIENT_STOCK',
      `สินค้า ${label} คงเหลือไม่พอ (เหลือ ${product.onHand.toLocaleString('th-TH')} ชิ้น)`,
      { productId, onHand: product.onHand },
    );
  }

  const movement = tx
    .insert(stockMovements)
    .values({
      productId,
      qtyChange,
      type: input.type,
      refType: input.ref?.type ?? null,
      refId: input.ref?.id ?? null,
      refDocNo: input.ref?.docNo ?? null,
      unitCostSatang: input.unitCostSatang ?? null,
      balanceAfter,
      reason: input.reason ?? null,
      performedBy: input.userId,
      createdAt: now,
    })
    .returning({ id: stockMovements.id })
    .get();

  const createdIds = newSerials.map(
    (unit) =>
      tx
        .insert(serialItems)
        .values({
          productId,
          serialNo: unit.serialNo,
          status: 'in_stock',
          unitCostSatang: unit.unitCostSatang,
          goodsReceiptItemId: unit.goodsReceiptItemId ?? null,
          receivedAt: now,
          supplierWarrantyExpiresAt: unit.supplierWarrantyExpiresAt ?? null,
        })
        .returning({ id: serialItems.id })
        .get().id,
  );
  if (existingIds.length) {
    tx.update(serialItems)
      .set({ status: input.serials!.status })
      .where(inArray(serialItems.id, existingIds))
      .run();
  }
  const serialIds = [...createdIds, ...existingIds];
  if (serialIds.length) {
    tx.insert(stockMovementSerials)
      .values(serialIds.map((serialItemId) => ({ movementId: movement.id, serialItemId })))
      .run();
  }

  tx.update(products).set({ onHand: balanceAfter }).where(eq(products.id, productId)).run();
  return { movementId: movement.id, balanceAfter, serialIds };
}

/**
 * Splits inbound serial numbers into units that already exist on a row in one of `reusable` statuses
 * (they come back in on that row — one physical unit keeps one row for life) and brand-new serials.
 * Anything else that already exists is left in `fresh`, so move() rejects it as SERIAL_EXISTS.
 */
export function splitInboundSerials(
  tx: Tx,
  productId: number,
  serialNos: string[],
  reusable: SerialStatus[],
): { reuse: { id: number; serialNo: string }[]; fresh: string[] } {
  if (serialNos.length === 0) return { reuse: [], fresh: [] };
  const reuse = tx
    .select({ id: serialItems.id, serialNo: serialItems.serialNo })
    .from(serialItems)
    .where(
      and(
        eq(serialItems.productId, productId),
        inArray(serialItems.status, reusable),
        inArray(
          sql`upper(${serialItems.serialNo})`,
          serialNos.map((s) => s.toUpperCase()),
        ),
      ),
    )
    .all();
  const reused = new Set(reuse.map((u) => u.serialNo.toUpperCase()));
  return { reuse, fresh: serialNos.filter((s) => !reused.has(s.toUpperCase())) };
}

function assertNewSerialsFree(tx: Tx, productId: number, label: string, units: NewSerialUnit[]) {
  const seen = new Set<string>();
  for (const { serialNo } of units) {
    const key = serialNo.toUpperCase();
    if (seen.has(key)) {
      throw badRequest('SERIAL_DUPLICATE', `ซีเรียล ${serialNo} ซ้ำกันในรายการ ${label}`);
    }
    seen.add(key);
  }
  if (units.length === 0) return;
  const clash = tx
    .select({ serialNo: serialItems.serialNo })
    .from(serialItems)
    .where(
      and(
        eq(serialItems.productId, productId),
        inArray(sql`upper(${serialItems.serialNo})`, [...seen]),
      ),
    )
    .get();
  if (clash) {
    throw conflict(
      'SERIAL_EXISTS',
      `ซีเรียล ${clash.serialNo} ของสินค้า ${label} มีอยู่ในระบบแล้ว`,
      {
        serialNo: clash.serialNo,
      },
    );
  }
}

function assertSerialsOf(
  tx: Tx,
  productId: number,
  ids: number[],
  statusOk: (status: SerialStatus) => boolean,
  error: () => Error,
) {
  if (ids.length === 0) return;
  const rows = tx
    .select({ productId: serialItems.productId, status: serialItems.status })
    .from(serialItems)
    .where(inArray(serialItems.id, ids))
    .all();
  if (rows.length !== ids.length || rows.some((r) => r.productId !== productId)) {
    throw badRequest('SERIAL_NOT_FOUND', 'ไม่พบซีเรียลบางตัวของสินค้านี้');
  }
  if (!rows.every((r) => statusOk(r.status))) throw error();
}

// ---------- integrity ----------

export interface StockMismatch {
  productId: number;
  sku: string;
  name: string;
  onHand: number;
  ledgerSum: number;
  /** Units with status in_stock (serial products only). */
  inStockSerials: number | null;
}

/** Products whose on_hand cache disagrees with the ledger (or, for serial products, the units). */
export function findStockMismatches(db: Pick<AppDatabase, 'all'>): StockMismatch[] {
  const rows = db.all<{
    productId: number;
    sku: string;
    name: string;
    onHand: number;
    serialRequired: number;
    ledgerSum: number;
    inStockSerials: number;
  }>(sql`
    select p.id as productId, p.sku, p.name, p.on_hand as onHand, p.serial_required as serialRequired,
      coalesce((select sum(m.qty_change) from ${stockMovements} m where m.product_id = p.id), 0) as ledgerSum,
      (select count(*) from ${serialItems} s where s.product_id = p.id and s.status = 'in_stock') as inStockSerials
    from ${products} p
  `);
  return rows
    .filter(
      (r) => r.onHand !== r.ledgerSum || (r.serialRequired === 1 && r.onHand !== r.inStockSerials),
    )
    .map((r) => ({
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      onHand: r.onHand,
      ledgerSum: r.ledgerSum,
      inStockSerials: r.serialRequired === 1 ? r.inStockSerials : null,
    }));
}
