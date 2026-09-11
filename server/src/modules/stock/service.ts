import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  fromBangkokParts,
  movingAverageCost,
  normalizeScannedCode,
  stockAdjustmentInputSchema,
  type ListStockMovementsFilters,
  type Paginated,
  type SessionUser,
  type StockAdjustmentInput,
  type StockAdjustmentResult,
  type StockIntegrityReport,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  products,
  serialItems,
  stockMovementSerials,
  stockMovements,
  users,
} from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { contains } from '../../lib/sql';
import { toIso } from '../../lib/time';
import { allocateDocNumber } from '../../services/numbering.service';
import * as stockService from '../../services/stock.service';

type Db = AppDatabase;

// ---------- adjustments (owner) ----------

/**
 * Adjusts stock for counting differences, damage, found items, or opening stock. One AJ document number
 * groups the lines; every line is a ledger row with the reason. Added units can carry a cost (moves the
 * average); removed serial units become "written off".
 */
export function adjustStock(
  db: Db,
  actor: SessionUser,
  rawInput: StockAdjustmentInput,
): StockAdjustmentResult {
  const input = stockAdjustmentInputSchema.parse(rawInput);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw badRequest('DUPLICATE_PRODUCT_LINE', 'มีสินค้าซ้ำกันในรายการ กรุณารวมเป็นรายการเดียว');
  }

  return db.transaction((tx) => {
    const now = Date.now();
    const docNo = allocateDocNumber(tx, 'adjustment', now);
    const result: StockAdjustmentResult['lines'] = [];

    input.lines.forEach((line, index) => {
      const product = tx.select().from(products).where(eq(products.id, line.productId)).get();
      if (!product) throw badRequest('PRODUCT_NOT_FOUND', `ไม่พบสินค้าในรายการที่ ${index + 1}`);
      const label = `"${product.name}"`;
      if (product.archivedAt) {
        throw badRequest('PRODUCT_ARCHIVED', `สินค้า ${label} ถูกซ่อนอยู่ ปรับสต็อกไม่ได้`);
      }

      let unitCost = product.costSatang;
      let move: Pick<stockService.StockMoveInput, 'newSerials' | 'serials'> = {};
      if (line.qtyChange > 0) {
        if (line.serialIds.length) {
          throw badRequest('SERIAL_DIRECTION', `การเพิ่มสต็อก ${label} ต้องสแกนซีเรียลใหม่`);
        }
        if (line.unitCostSatang != null) {
          unitCost = line.unitCostSatang;
          tx.update(products)
            .set({
              costSatang: movingAverageCost(
                product.onHand,
                product.costSatang,
                line.qtyChange,
                unitCost,
              ),
            })
            .where(eq(products.id, product.id))
            .run();
        }
        const serials = line.serials.map(normalizeScannedCode);
        if (new Set(serials.map((s) => s.toUpperCase())).size !== serials.length) {
          throw badRequest('SERIAL_DUPLICATE', `มีซีเรียลซ้ำกันในรายการสินค้า ${label}`);
        }
        // Units that were written off or sent back can be found again (same row).
        const { reuse, fresh } = stockService.splitInboundSerials(tx, product.id, serials, [
          'written_off',
          'returned_to_supplier',
        ]);
        for (const unit of reuse) {
          tx.update(serialItems)
            .set({ unitCostSatang: unitCost })
            .where(eq(serialItems.id, unit.id))
            .run();
        }
        move = {
          newSerials: fresh.map((serialNo) => ({ serialNo, unitCostSatang: unitCost })),
          serials: reuse.length ? { ids: reuse.map((u) => u.id), status: 'in_stock' } : undefined,
        };
      } else {
        if (line.serials.length || line.unitCostSatang != null) {
          throw badRequest(
            'SERIAL_DIRECTION',
            `การลดสต็อก ${label} ให้เลือกซีเรียลที่มีอยู่ (ไม่ต้องใส่ต้นทุน)`,
          );
        }
        if (line.serialIds.length) {
          move = { serials: { ids: line.serialIds, status: 'written_off' } };
        }
      }

      const moved = stockService.move(tx, {
        productId: product.id,
        qtyChange: line.qtyChange,
        type: 'adjustment',
        ref: { type: 'adjustment', docNo },
        unitCostSatang: unitCost,
        reason: input.reason,
        userId: actor.id,
        now,
        ...move,
      });
      result.push({
        productId: product.id,
        productName: product.name,
        qtyChange: line.qtyChange,
        balanceAfter: moved.balanceAfter,
      });
    });

    writeAudit(tx, {
      userId: actor.id,
      action: 'stock.adjust',
      entityType: 'adjustment',
      detail: {
        docNo,
        reason: input.reason,
        lines: result.map(({ productId, qtyChange, balanceAfter }) => ({
          productId,
          qtyChange,
          balanceAfter,
        })),
      },
    });
    return { docNo, lines: result };
  });
}

// ---------- movement history ----------

export interface StockMovementFull {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  qtyChange: number;
  type: (typeof stockMovements.$inferSelect)['type'];
  refType: string | null;
  refId: number | null;
  refDocNo: string | null;
  balanceAfter: number;
  reason: string | null;
  performedByName: string | null;
  createdAt: string;
  serialNos: string[];
  unitCostSatang: number | null;
}

/** "YYYY-MM-DD" (Bangkok) → the UTC ms of that day's 00:00 in Bangkok. */
function bangkokDayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return fromBangkokParts(y, m, d);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const serialNosSql = sql<string | null>`(
  select group_concat(${serialItems.serialNo}, char(10))
  from ${stockMovementSerials} join ${serialItems} on ${serialItems.id} = ${stockMovementSerials.serialItemId}
  where ${stockMovementSerials.movementId} = ${stockMovements.id}
)`;

export function listStockMovements(
  db: Db,
  query: ListStockMovementsFilters,
): Paginated<StockMovementFull> {
  const filters: SQL[] = [];
  if (query.productId) filters.push(eq(stockMovements.productId, query.productId));
  if (query.type) filters.push(eq(stockMovements.type, query.type));
  if (query.q) filters.push(contains(stockMovements.refDocNo, query.q));
  if (query.from) filters.push(sql`${stockMovements.createdAt} >= ${bangkokDayStart(query.from)}`);
  if (query.to) {
    filters.push(sql`${stockMovements.createdAt} < ${bangkokDayStart(query.to) + DAY_MS}`);
  }
  const where = and(...filters);

  const rows = db
    .select({
      movement: stockMovements,
      productName: products.name,
      productSku: products.sku,
      performedByName: users.name,
      serialNos: serialNosSql,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(users, eq(users.id, stockMovements.performedBy))
    .where(where)
    .orderBy(desc(stockMovements.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(stockMovements).where(where).get()!.n;

  return {
    total,
    items: rows.map(({ movement: m, productName, productSku, performedByName, serialNos }) => ({
      id: m.id,
      productId: m.productId,
      productName,
      productSku,
      qtyChange: m.qtyChange,
      type: m.type,
      refType: m.refType,
      refId: m.refId,
      refDocNo: m.refDocNo,
      balanceAfter: m.balanceAfter,
      reason: m.reason,
      performedByName,
      createdAt: toIso(m.createdAt),
      serialNos: serialNos ? serialNos.split('\n').sort() : [],
      unitCostSatang: m.unitCostSatang,
    })),
  };
}

// ---------- integrity (owner) ----------

export function checkStockIntegrity(db: Db): StockIntegrityReport {
  const mismatches = stockService.findStockMismatches(db);
  const productCount = db.select({ n: count() }).from(products).get()!.n;
  return {
    ok: mismatches.length === 0,
    checkedAt: new Date().toISOString(),
    productCount,
    mismatches,
  };
}
