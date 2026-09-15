// Read side of returns: the list (no cost in it, so both roles share one shape).

import { and, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import type { ListReturnsFilters, Paginated, ReturnListItem } from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { saleReturnItems, saleReturns, sales, serialItems, users } from '../../db/schema';
import { bangkokDateFilters, contains } from '../../lib/sql';
import { toIso } from '../../lib/time';

type Db = Pick<AppDatabase, 'select'>;

const itemCountSql = sql<number>`(select coalesce(sum(${saleReturnItems.qty}), 0) from ${saleReturnItems}
  where ${saleReturnItems.returnId} = ${saleReturns.id})`;
const pendingCountSql = sql<number>`(select coalesce(sum(${saleReturnItems.qty}), 0) from ${saleReturnItems}
  where ${saleReturnItems.returnId} = ${saleReturns.id} and ${saleReturnItems.disposition} = 'pending')`;

export function selectReturnListItems(db: Db) {
  return db
    .select({
      ret: saleReturns,
      saleDocNo: sales.docNo,
      saleSoldAt: sales.soldAt,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      createdByName: users.name,
      itemCount: itemCountSql,
      pendingCount: pendingCountSql,
    })
    .from(saleReturns)
    .innerJoin(sales, eq(sales.id, saleReturns.saleId))
    .leftJoin(users, eq(users.id, saleReturns.createdBy));
}

type ListRow = ReturnType<ReturnType<typeof selectReturnListItems>['all']>[number];

export function toReturnListItem(row: ListRow): ReturnListItem {
  const r = row.ret;
  return {
    id: r.id,
    docNo: r.docNo,
    saleId: r.saleId,
    saleDocNo: row.saleDocNo,
    returnedAt: toIso(r.returnedAt),
    reason: r.reason,
    refundMethod: r.refundMethod,
    refundSatang: r.refundSatang,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    itemCount: row.itemCount,
    pendingCount: row.pendingCount,
    createdByName: row.createdByName,
  };
}

export function listReturns(
  db: Db,
  query: ListReturnsFilters,
  scope: { customerId?: number } = {},
): Paginated<ReturnListItem> {
  const filters: SQL[] = [];
  if (query.q) {
    const returnedSerial = sql`exists (select 1 from ${saleReturnItems}
      join ${serialItems} on ${serialItems.id} = ${saleReturnItems.serialItemId}
      where ${saleReturnItems.returnId} = ${saleReturns.id} and ${contains(serialItems.serialNo, query.q)})`;
    filters.push(
      or(
        contains(saleReturns.docNo, query.q),
        contains(sales.docNo, query.q),
        contains(sales.customerName, query.q),
        contains(sales.customerPhone, query.q),
        returnedSerial,
      )!,
    );
  }
  if (query.pending) filters.push(sql`${pendingCountSql} > 0`);
  if (query.saleId) filters.push(eq(saleReturns.saleId, query.saleId));
  if (scope.customerId) filters.push(eq(sales.customerId, scope.customerId));
  filters.push(...bangkokDateFilters(saleReturns.returnedAt, query.from, query.to));
  const where = and(...filters);

  const rows = selectReturnListItems(db)
    .where(where)
    .orderBy(desc(saleReturns.returnedAt), desc(saleReturns.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db
    .select({ n: count() })
    .from(saleReturns)
    .innerJoin(sales, eq(sales.id, saleReturns.saleId))
    .where(where)
    .get()!.n;
  return { items: rows.map(toReturnListItem), total };
}
