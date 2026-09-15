import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  addBangkokMonths,
  cartTotals,
  checkoutInputSchema,
  checkPayment,
  divRound,
  formatBaht,
  isDiscounted,
  PAYMENT_PROBLEM_MESSAGES,
  type CheckoutInput,
  type Sale,
  type SaleItemKind,
  type SessionUser,
  type WarrantyType,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  categories,
  customers,
  payments,
  products,
  saleItemSerials,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  serialItems,
  users,
} from '../../db/schema';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { toIso, toIsoOrNull } from '../../lib/time';
import { allocateDocNumber } from '../../services/numbering.service';
import * as stockService from '../../services/stock.service';
import { selectSaleListItems, toSaleListItem } from './queries';

type Db = AppDatabase;
type DbOrTx = Pick<AppDatabase, 'select'>;

/** The full (owner) shape; routes narrow it for staff with respondByRole. */
export type SaleFull = Sale & {
  totalCostSatang: number;
  profitSatang: number;
  lines: (Sale['lines'][number] & { unitCostSatang: number })[];
};

const SALE_NOT_FOUND = () => notFound('ไม่พบบิลขายนี้');

/** Shop warranty end for a unit sold on a line (null when the line has no warranty). */
export function warrantyExpiry(soldAt: number, type: WarrantyType, months: number): number | null {
  return type !== 'none' && months > 0 ? addBangkokMonths(soldAt, months) : null;
}

// ---------- read ----------

export function getSale(db: DbOrTx, id: number): SaleFull {
  const row = selectSaleListItems(db).where(eq(sales.id, id)).get();
  if (!row) throw SALE_NOT_FOUND();
  const sale = row.sale;

  const lines = db
    .select({ item: saleItems, serialRequired: products.serialRequired })
    .from(saleItems)
    .leftJoin(products, eq(products.id, saleItems.productId))
    .where(eq(saleItems.saleId, id))
    .orderBy(asc(saleItems.sortOrder), asc(saleItems.id))
    .all();
  const lineIds = lines.map((l) => l.item.id);
  const serials = lineIds.length
    ? db
        .select({
          saleItemId: saleItemSerials.saleItemId,
          id: serialItems.id,
          serialNo: serialItems.serialNo,
          returned: sql<number>`exists (select 1 from ${saleReturnItems}
            where ${saleReturnItems.saleItemId} = ${saleItemSerials.saleItemId}
            and ${saleReturnItems.serialItemId} = ${saleItemSerials.serialItemId})`,
        })
        .from(saleItemSerials)
        .innerJoin(serialItems, eq(serialItems.id, saleItemSerials.serialItemId))
        .where(inArray(saleItemSerials.saleItemId, lineIds))
        .orderBy(asc(serialItems.serialNo))
        .all()
    : [];

  const receiver = alias(users, 'receiver');
  const payment = db
    .select({ payment: payments, receivedByName: receiver.name })
    .from(payments)
    .leftJoin(receiver, eq(receiver.id, payments.receivedBy))
    .where(eq(payments.saleId, id))
    .orderBy(asc(payments.id))
    .get();

  const returns = db
    .select({
      ret: saleReturns,
      itemCount: sql<number>`(select coalesce(sum(${saleReturnItems.qty}), 0) from ${saleReturnItems}
        where ${saleReturnItems.returnId} = ${saleReturns.id})`,
    })
    .from(saleReturns)
    .where(eq(saleReturns.saleId, id))
    .orderBy(asc(saleReturns.returnedAt), asc(saleReturns.id))
    .all();

  const voidedByName =
    sale.voidedBy === null
      ? null
      : (db.select({ name: users.name }).from(users).where(eq(users.id, sale.voidedBy)).get()
          ?.name ?? null);

  return {
    ...toSaleListItem(row),
    note: sale.note,
    createdAt: toIso(sale.createdAt),
    voidedAt: toIsoOrNull(sale.voidedAt),
    voidedByName,
    voidReason: sale.voidReason,
    payment: payment
      ? {
          id: payment.payment.id,
          method: payment.payment.method,
          amountSatang: payment.payment.amountSatang,
          receivedSatang: payment.payment.receivedSatang,
          changeSatang: payment.payment.changeSatang,
          paidAt: toIso(payment.payment.paidAt),
          receivedByName: payment.receivedByName,
          voidedAt: toIsoOrNull(payment.payment.voidedAt),
        }
      : null,
    returns: returns.map(({ ret, itemCount }) => ({
      id: ret.id,
      docNo: ret.docNo,
      returnedAt: toIso(ret.returnedAt),
      refundMethod: ret.refundMethod,
      refundSatang: ret.refundSatang,
      itemCount,
    })),
    lines: lines.map(({ item, serialRequired }) => {
      const expiry = warrantyExpiry(
        sale.soldAt,
        item.warrantyType as WarrantyType,
        item.warrantyMonths,
      );
      return {
        id: item.id,
        kind: item.kind,
        parentItemId: item.parentItemId,
        productId: item.productId,
        name: item.nameSnapshot,
        sku: item.skuSnapshot,
        qty: item.qty,
        unitPriceSatang: item.unitPriceSatang,
        regularPriceSatang: item.regularPriceSatang,
        lineTotalSatang: item.lineTotalSatang,
        warrantyType: item.warrantyType as WarrantyType,
        warrantyMonths: item.warrantyMonths,
        returnedQty: item.returnedQty,
        serialRequired: serialRequired ?? false,
        unitCostSatang: item.unitCostSatang,
        serials: serials
          .filter((s) => s.saleItemId === item.id)
          .map((s) => ({
            id: s.id,
            serialNo: s.serialNo,
            returned: s.returned === 1,
            warrantyExpiresAt: toIsoOrNull(expiry),
          })),
      };
    }),
  };
}

// ---------- checkout (PLAN.md §7.4) ----------

interface PreparedLine {
  product: typeof products.$inferSelect;
  kind: SaleItemKind;
  qty: number;
  serialIds: number[];
  unitPriceSatang: number;
  regularPriceSatang: number | null;
  unitCostSatang: number;
}

/**
 * Confirm checkout: one transaction allocates the document number, writes the sale with snapshot lines,
 * records the payment, takes the stock out, and marks the serial units sold. Prices always come from
 * the product records; `expectedTotalSatang` guards against a price that changed while the cart was
 * open (P25). Stock changes only here, never while the cart is being built (Q1).
 */
export function checkout(db: Db, actor: SessionUser, rawInput: CheckoutInput): SaleFull {
  const input = checkoutInputSchema.parse(rawInput);
  const productIds = input.items.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw badRequest('DUPLICATE_PRODUCT_LINE', 'มีสินค้าซ้ำกันในตะกร้า กรุณารวมเป็นรายการเดียว');
  }

  const id = db.transaction((tx) => {
    const customer = input.customerId
      ? tx.select().from(customers).where(eq(customers.id, input.customerId)).get()
      : undefined;
    if (input.customerId && !customer) {
      throw badRequest('CUSTOMER_NOT_FOUND', 'ไม่พบลูกค้าที่เลือก');
    }
    if (customer?.archivedAt) {
      throw badRequest('CUSTOMER_ARCHIVED', 'ลูกค้านี้ถูกซ่อนอยู่ กรุณาเลือกลูกค้าอื่น');
    }

    // Validate and price every line before writing anything.
    const prepared = input.items.map((line, index): PreparedLine => {
      const found = tx
        .select({ product: products, categoryKind: categories.kind })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.id, line.productId))
        .get();
      if (!found) throw badRequest('PRODUCT_NOT_FOUND', `ไม่พบสินค้าในรายการที่ ${index + 1}`);
      const { product } = found;
      const label = `"${product.name}"`;
      if (product.archivedAt) {
        throw badRequest('PRODUCT_ARCHIVED', `สินค้า ${label} ถูกซ่อนอยู่ ขายไม่ได้`);
      }
      if (product.priceSatang === null) {
        throw badRequest('AWAITING_PRICE', `สินค้า ${label} ยังไม่ได้ตั้งราคา ขายไม่ได้`);
      }

      const serialIds = [...new Set(line.serialItemIds)];
      let unitCost = product.costSatang;
      if (product.serialRequired) {
        if (serialIds.length !== line.qty) {
          throw badRequest(
            'SERIAL_COUNT_MISMATCH',
            `สินค้า ${label} ต้องเลือกซีเรียลให้ครบ ${line.qty} ชิ้น (ตอนนี้เลือก ${serialIds.length})`,
          );
        }
        // P22: a serial unit carries its own cost. A line stores one unit cost, so a line of several
        // units stores their average (at most a satang or so of rounding per line).
        const units = tx
          .select({ unitCostSatang: serialItems.unitCostSatang })
          .from(serialItems)
          .where(and(inArray(serialItems.id, serialIds), eq(serialItems.productId, product.id)))
          .all();
        if (units.length === serialIds.length) {
          unitCost = divRound(
            units.reduce((sum, u) => sum + u.unitCostSatang, 0),
            units.length,
          );
        } // otherwise stockService.move() rejects the unknown units below
      } else if (serialIds.length) {
        throw badRequest('SERIAL_NOT_TRACKED', `สินค้า ${label} ไม่ได้บันทึกซีเรียล`);
      }

      const priced = {
        priceSatang: product.priceSatang,
        regularPriceSatang: product.regularPriceSatang,
      };
      return {
        product,
        kind: found.categoryKind === 'service' ? 'service' : 'product',
        qty: line.qty,
        serialIds,
        unitPriceSatang: product.priceSatang,
        regularPriceSatang: isDiscounted(priced) ? product.regularPriceSatang : null,
        unitCostSatang: unitCost,
      };
    });

    const totals = cartTotals(prepared);
    if (totals.totalSatang !== input.expectedTotalSatang) {
      throw conflict(
        'PRICE_CHANGED',
        `ราคาสินค้ามีการเปลี่ยนแปลง ยอดที่ต้องชำระตอนนี้คือ ฿${formatBaht(totals.totalSatang)} กรุณาตรวจสอบตะกร้าอีกครั้ง`,
        { totalSatang: totals.totalSatang },
      );
    }
    const paymentCheck = checkPayment(
      input.payment.method,
      input.payment.receivedSatang,
      totals.totalSatang,
    );
    if (!paymentCheck.ok) {
      throw badRequest('PAYMENT_INVALID', PAYMENT_PROBLEM_MESSAGES[paymentCheck.problem!]);
    }

    const now = Date.now();
    const docNo = allocateDocNumber(tx, 'sale', now);
    const totalCost = prepared.reduce((sum, l) => sum + l.unitCostSatang * l.qty, 0);
    const sale = tx
      .insert(sales)
      .values({
        docNo,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? '',
        customerPhone: customer?.phone ?? '',
        soldAt: now,
        status: 'paid',
        totalSatang: totals.totalSatang,
        savingsSatang: totals.savingsSatang,
        totalCostSatang: totalCost,
        source: 'pos',
        note: input.note,
        salespersonId: actor.id,
        createdAt: now,
      })
      .returning({ id: sales.id })
      .get();

    prepared.forEach((line, index) => {
      const { product } = line;
      const item = tx
        .insert(saleItems)
        .values({
          saleId: sale.id,
          kind: line.kind,
          productId: product.id,
          nameSnapshot: product.name,
          skuSnapshot: product.sku,
          qty: line.qty,
          unitPriceSatang: line.unitPriceSatang,
          lineTotalSatang: line.unitPriceSatang * line.qty,
          regularPriceSatang: line.regularPriceSatang,
          unitCostSatang: line.unitCostSatang,
          warrantyType: product.warrantyType,
          warrantyMonths: product.warrantyMonths,
          sortOrder: index,
        })
        .returning({ id: saleItems.id })
        .get();

      // Services and other untracked products have no stock to take out.
      if (product.trackStock) {
        stockService.move(tx, {
          productId: product.id,
          qtyChange: -line.qty,
          type: 'sale',
          ref: { type: 'sale', id: sale.id, docNo },
          unitCostSatang: line.unitCostSatang,
          userId: actor.id,
          serials: line.serialIds.length ? { ids: line.serialIds, status: 'sold' } : undefined,
          now,
        });
      }
      if (line.serialIds.length) {
        tx.insert(saleItemSerials)
          .values(line.serialIds.map((serialItemId) => ({ saleItemId: item.id, serialItemId })))
          .run();
      }
    });

    tx.insert(payments)
      .values({
        saleId: sale.id,
        method: input.payment.method,
        amountSatang: totals.totalSatang,
        receivedSatang: input.payment.receivedSatang,
        changeSatang: paymentCheck.changeSatang,
        paidAt: now,
        receivedBy: actor.id,
      })
      .run();
    return sale.id;
  });
  return getSale(db, id);
}
