// The home dashboard (PLAN.md §9, Q13). Everyone gets activity; the owner also gets money. Staff
// responses are narrowed with respondByRole, so revenue and profit never leave the server for them.

import { sql } from 'drizzle-orm';
import {
  bangkokDateKey,
  bangkokDateKeyToMs,
  dashboardQuerySchema,
  type DashboardQuery,
  type DashboardSummary,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  goodsReceipts,
  products,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
} from '../../db/schema';
import { badRequest } from '../../lib/errors';

type Db = Pick<AppDatabase, 'get' | 'all'>;
export type DashboardFull = Required<DashboardSummary>;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;
const LOW_STOCK_LIMIT = 10;
const BEST_SELLER_LIMIT = 5;

/** Bangkok calendar day of an epoch-ms column, as "YYYY-MM-DD" (PLAN.md §7.10). */
const bangkokDay = (column: unknown) => sql`date(${column} / 1000, 'unixepoch', '+7 hours')`;

export function getDashboardSummary(
  db: Db,
  userId: number,
  rawQuery: DashboardQuery,
  now = Date.now(),
): DashboardFull {
  const query = dashboardQuerySchema.parse(rawQuery);
  const from = query.from ?? bangkokDateKey(now);
  const to = query.to ?? from;
  if (to < from) throw badRequest('INVALID_RANGE', 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น');
  const start = bangkokDateKeyToMs(from);
  const end = bangkokDateKeyToMs(to) + DAY_MS;
  const days = Math.round((end - start) / DAY_MS);
  if (days > MAX_DAYS) throw badRequest('RANGE_TOO_LONG', 'เลือกช่วงเวลาได้ไม่เกิน 1 ปี');

  const paidInRange = sql`${sales.status} = 'paid' and ${sales.soldAt} >= ${start} and ${sales.soldAt} < ${end}`;
  const returnsInRange = sql`${saleReturns.returnedAt} >= ${start} and ${saleReturns.returnedAt} < ${end}`;

  const salesTotals = db.get<{ n: number; total: number; cost: number; mine: number }>(sql`
    select count(*) as n, coalesce(sum(${sales.totalSatang}), 0) as total,
      coalesce(sum(${sales.totalCostSatang}), 0) as cost,
      coalesce(sum(${sales.salespersonId} = ${userId}), 0) as mine
    from ${sales} where ${paidInRange}`);
  const units = db.get<{ all: number; mine: number }>(sql`
    select coalesce(sum(${saleItems.qty}), 0) as "all",
      coalesce(sum(case when ${sales.salespersonId} = ${userId} then ${saleItems.qty} else 0 end), 0) as mine
    from ${saleItems} join ${sales} on ${sales.id} = ${saleItems.saleId}
    where ${paidInRange} and ${saleItems.parentItemId} is null`);
  const refunds = db.get<{ refund: number }>(sql`
    select coalesce(sum(${saleReturns.refundSatang}), 0) as refund
    from ${saleReturns} where ${returnsInRange}`);
  const returned = db.get<{ qty: number; cost: number }>(sql`
    select coalesce(sum(${saleReturnItems.qty}), 0) as qty,
      coalesce(sum(${saleReturnItems.qty} * ${saleReturnItems.unitCostSatang}), 0) as cost
    from ${saleReturnItems} join ${saleReturns} on ${saleReturns.id} = ${saleReturnItems.returnId}
    where ${returnsInRange}`);
  const pending = db.get<{ units: number; docs: number }>(sql`
    select coalesce(sum(${saleReturnItems.qty}), 0) as units,
      count(distinct ${saleReturnItems.returnId}) as docs
    from ${saleReturnItems} where ${saleReturnItems.disposition} = 'pending'`);

  // Stock: tracked, active products. "Low" never overlaps "out", like the product list filters.
  const active = sql`${products.archivedAt} is null and ${products.trackStock} = 1`;
  const stockCounts = db.get<{ low: number; out: number }>(sql`
    select coalesce(sum(${products.onHand} > 0 and ${products.onHand} <= ${products.minStock}), 0) as low,
      coalesce(sum(${products.onHand} <= 0), 0) as out
    from ${products} where ${active}`);
  const lowStock = db.all<{
    id: number;
    sku: string;
    name: string;
    onHand: number;
    minStock: number;
  }>(sql`
    select ${products.id} as id, ${products.sku} as sku, ${products.name} as name,
      ${products.onHand} as onHand, ${products.minStock} as minStock
    from ${products}
    where ${active} and ${products.onHand} <= ${products.minStock}
    order by ${products.onHand} > 0, ${products.onHand}, ${products.name}
    limit ${LOW_STOCK_LIMIT}`);
  const inventory = db.get<{ value: number }>(sql`
    select coalesce(sum(${products.onHand} * ${products.costSatang}), 0) as value
    from ${products} where ${products.trackStock} = 1 and ${products.onHand} > 0`);

  // Daily chart: sales by the day they happened, refunds by the day they were given.
  const salesByDay = db.all<{ day: string; n: number; total: number }>(sql`
    select ${bangkokDay(sales.soldAt)} as day, count(*) as n, sum(${sales.totalSatang}) as total
    from ${sales} where ${paidInRange} group by day`);
  const refundsByDay = db.all<{ day: string; refund: number }>(sql`
    select ${bangkokDay(saleReturns.returnedAt)} as day, sum(${saleReturns.refundSatang}) as refund
    from ${saleReturns} where ${returnsInRange} group by day`);
  const salesMap = new Map(salesByDay.map((r) => [r.day, r]));
  const refundMap = new Map(refundsByDay.map((r) => [r.day, r.refund]));
  const daily = Array.from({ length: days }, (_, i) => {
    const date = bangkokDateKey(start + i * DAY_MS);
    const day = salesMap.get(date);
    return {
      date,
      saleCount: day?.n ?? 0,
      netSalesSatang: (day?.total ?? 0) - (refundMap.get(date) ?? 0),
    };
  });

  const bestSellers = db.all<{
    productId: number;
    name: string;
    sku: string;
    qty: number;
    revenueSatang: number;
  }>(sql`
    select ${saleItems.productId} as productId, ${products.name} as name, ${products.sku} as sku,
      sum(${saleItems.qty} - ${saleItems.returnedQty}) as qty,
      sum((${saleItems.qty} - ${saleItems.returnedQty}) * ${saleItems.unitPriceSatang}) as revenueSatang
    from ${saleItems}
      join ${sales} on ${sales.id} = ${saleItems.saleId}
      join ${products} on ${products.id} = ${saleItems.productId}
    where ${paidInRange} and ${saleItems.parentItemId} is null
    group by ${saleItems.productId}
    having qty > 0
    order by qty desc, revenueSatang desc
    limit ${BEST_SELLER_LIMIT}`);

  const todo = db.get<{ unverified: number; awaitingPrice: number }>(sql`
    select
      (select count(*) from ${goodsReceipts}
        where ${goodsReceipts.status} = 'posted' and ${goodsReceipts.costStatus} = 'unverified') as unverified,
      (select count(*) from ${products}
        where ${products.archivedAt} is null and ${products.priceSatang} is null) as awaitingPrice`);

  const grossSalesSatang = salesTotals!.total;
  const refundTotalSatang = refunds!.refund;
  const netSalesSatang = grossSalesSatang - refundTotalSatang;
  return {
    from,
    to,
    saleCount: salesTotals!.n,
    itemCount: units!.all,
    mySaleCount: salesTotals!.mine,
    myItemCount: units!.mine,
    returnedUnitCount: returned!.qty,
    pendingReturnUnits: pending!.units,
    pendingReturnDocs: pending!.docs,
    lowStockCount: stockCounts!.low,
    outOfStockCount: stockCounts!.out,
    lowStock,
    grossSalesSatang,
    refundTotalSatang,
    netSalesSatang,
    profitSatang: netSalesSatang - (salesTotals!.cost - returned!.cost),
    inventoryValueSatang: inventory!.value,
    daily,
    bestSellers,
    unverifiedReceiptCount: todo!.unverified,
    awaitingPriceCount: todo!.awaitingPrice,
  };
}
