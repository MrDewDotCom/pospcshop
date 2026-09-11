import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  normalizeScannedCode,
  type ListSerialsFilters,
  type Paginated,
  type SerialStatus,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { products, serialItems } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { contains } from '../../lib/sql';
import { toIso, toIsoOrNull } from '../../lib/time';

export interface SerialItemFull {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  serialNo: string;
  status: SerialStatus;
  wasReturned: boolean;
  receivedAt: string;
  supplierWarrantyExpiresAt: string | null;
  notes: string;
  unitCostSatang: number;
}

function select(db: AppDatabase) {
  return db
    .select({ unit: serialItems, productName: products.name, productSku: products.sku })
    .from(serialItems)
    .innerJoin(products, eq(products.id, serialItems.productId));
}

function toItem({
  unit,
  productName,
  productSku,
}: ReturnType<ReturnType<typeof select>['all']>[number]): SerialItemFull {
  return {
    id: unit.id,
    productId: unit.productId,
    productName,
    productSku,
    serialNo: unit.serialNo,
    status: unit.status,
    wasReturned: unit.wasReturned,
    receivedAt: toIso(unit.receivedAt),
    supplierWarrantyExpiresAt: toIsoOrNull(unit.supplierWarrantyExpiresAt),
    notes: unit.notes,
    unitCostSatang: unit.unitCostSatang,
  };
}

/** Serial search across all products (also matches codes typed with the Thai keyboard layout). */
export function listSerials(db: AppDatabase, query: ListSerialsFilters): Paginated<SerialItemFull> {
  const filters: SQL[] = [];
  if (query.q) filters.push(contains(serialItems.serialNo, normalizeScannedCode(query.q)));
  if (query.status) filters.push(eq(serialItems.status, query.status));
  const where = and(...filters);
  const rows = select(db)
    .where(where)
    // Units in stock first, then the most recently received.
    .orderBy(
      sql`${serialItems.status} <> 'in_stock'`,
      desc(serialItems.receivedAt),
      desc(serialItems.id),
    )
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(serialItems).where(where).get()!.n;
  return { items: rows.map(toItem), total };
}

/** Every unit of one product (in stock first, oldest received first so FIFO picks come naturally). */
export function listProductSerials(
  db: AppDatabase,
  productId: number,
  status?: SerialStatus,
): SerialItemFull[] {
  if (!db.select({ id: products.id }).from(products).where(eq(products.id, productId)).get()) {
    throw notFound('ไม่พบสินค้านี้');
  }
  return select(db)
    .where(
      and(
        eq(serialItems.productId, productId),
        status ? eq(serialItems.status, status) : undefined,
      ),
    )
    .orderBy(
      sql`${serialItems.status} <> 'in_stock'`,
      asc(serialItems.receivedAt),
      asc(serialItems.id),
    )
    .all()
    .map(toItem);
}
