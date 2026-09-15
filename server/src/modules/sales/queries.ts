// Read side of sales: list items shaped in full (owner) form. Routes narrow them for staff with
// respondByRole, so cost and profit never reach a staff response.

import { and, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import {
  normalizePhone,
  saleProfitSatang,
  type ListSalesFilters,
  type Paginated,
  type SaleListItem,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  payments,
  saleItemSerials,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  serialItems,
  users,
} from '../../db/schema';
import { bangkokDateFilters, contains, escapeLike } from '../../lib/sql';
import { toIso } from '../../lib/time';

type Db = Pick<AppDatabase, 'select'>;

export type SaleListItemFull = Required<SaleListItem>;

const itemCountSql = sql<number>`(select coalesce(sum(${saleItems.qty}), 0) from ${saleItems}
  where ${saleItems.saleId} = ${sales.id} and ${saleItems.parentItemId} is null)`;
const paymentMethodSql = sql<
  (typeof payments.$inferSelect)['method'] | null
>`(select ${payments.method} from ${payments} where ${payments.saleId} = ${sales.id} order by ${payments.id} limit 1)`;
const returnCountSql = sql<number>`(select count(*) from ${saleReturns} where ${saleReturns.saleId} = ${sales.id})`;
/** Cost of everything that came back on this sale's returns (it leaves profit again, §7.8). */
export const returnedCostSql = sql<number>`(select coalesce(sum(${saleReturnItems.unitCostSatang} * ${saleReturnItems.qty}), 0)
  from ${saleReturnItems} join ${saleReturns} on ${saleReturns.id} = ${saleReturnItems.returnId}
  where ${saleReturns.saleId} = ${sales.id})`;

export function selectSaleListItems(db: Db) {
  return db
    .select({
      sale: sales,
      salespersonName: users.name,
      itemCount: itemCountSql,
      paymentMethod: paymentMethodSql,
      returnCount: returnCountSql,
      returnedCost: returnedCostSql,
    })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.salespersonId));
}

type ListRow = ReturnType<ReturnType<typeof selectSaleListItems>['all']>[number];

export function toSaleListItem(row: ListRow): SaleListItemFull {
  const s = row.sale;
  const voided = s.status === 'voided';
  return {
    id: s.id,
    docNo: s.docNo,
    soldAt: toIso(s.soldAt),
    status: s.status,
    source: s.source,
    customerId: s.customerId,
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    totalSatang: s.totalSatang,
    savingsSatang: s.savingsSatang,
    refundedSatang: s.refundedSatang,
    itemCount: row.itemCount,
    paymentMethod: row.paymentMethod,
    salespersonId: s.salespersonId,
    salespersonName: row.salespersonName,
    returnCount: row.returnCount,
    totalCostSatang: s.totalCostSatang,
    // A voided sale earned nothing.
    profitSatang: voided
      ? 0
      : saleProfitSatang({
          totalSatang: s.totalSatang,
          refundedSatang: s.refundedSatang,
          totalCostSatang: s.totalCostSatang,
          returnedCostSatang: row.returnedCost,
        }),
  };
}

/** Sales whose snapshot phone contains the digits of `q` (ignoring dashes and spaces). */
function phoneMatches(q: string): SQL | null {
  const digits = normalizePhone(q);
  if (digits.length < 3) return null;
  return sql`replace(replace(${sales.customerPhone}, '-', ''), ' ', '') LIKE ${`%${escapeLike(digits)}%`} ESCAPE '\\'`;
}

export interface SaleListScope {
  /** The current user's id when the list is limited to their own sales (`mine=true`). */
  salespersonId?: number;
}

export function listSales(
  db: Db,
  query: Omit<ListSalesFilters, 'mine'>,
  scope: SaleListScope = {},
): Paginated<SaleListItemFull> {
  const filters: SQL[] = [];
  if (query.q) {
    const soldSerial = sql`exists (select 1 from ${saleItemSerials}
      join ${saleItems} on ${saleItems.id} = ${saleItemSerials.saleItemId}
      join ${serialItems} on ${serialItems.id} = ${saleItemSerials.serialItemId}
      where ${saleItems.saleId} = ${sales.id} and ${contains(serialItems.serialNo, query.q)})`;
    filters.push(
      or(
        contains(sales.docNo, query.q),
        contains(sales.customerName, query.q),
        contains(sales.customerPhone, query.q),
        ...[phoneMatches(query.q)].filter((f): f is SQL => f !== null),
        soldSerial,
      )!,
    );
  }
  filters.push(...bangkokDateFilters(sales.soldAt, query.from, query.to));
  if (query.status) filters.push(eq(sales.status, query.status));
  if (query.paymentMethod) filters.push(eq(paymentMethodSql, query.paymentMethod));
  if (query.customerId) filters.push(eq(sales.customerId, query.customerId));
  if (scope.salespersonId) filters.push(eq(sales.salespersonId, scope.salespersonId));
  const where = and(...filters);

  const rows = selectSaleListItems(db)
    .where(where)
    .orderBy(desc(sales.soldAt), desc(sales.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(sales).where(where).get()!.n;
  return { items: rows.map(toSaleListItem), total };
}
