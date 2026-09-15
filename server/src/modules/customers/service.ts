import { and, asc, count, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  customerInputSchema,
  normalizePhone,
  type CustomerInput,
  type CustomerListItem,
  type CustomerPhoneMatch,
  type ListCustomersFilters,
  type Paginated,
  type ReturnListItem,
  type SessionUser,
  type UpdateCustomerInput,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { customers, sales } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { contains, escapeLike } from '../../lib/sql';
import { toIso, toIsoOrNull } from '../../lib/time';
import { listReturns } from '../returns/queries';
import { listSales, type SaleListItemFull } from '../sales/queries';

type Db = AppDatabase;
type DbOrTx = Pick<AppDatabase, 'select'>;

const CUSTOMER_NOT_FOUND = () => notFound('ไม่พบลูกค้านี้');

// Voided sales don't count as purchases.
const saleCountSql = sql<number>`(select count(*) from ${sales}
  where ${sales.customerId} = ${customers.id} and ${sales.status} = 'paid')`;
const lastSaleAtSql = sql<number | null>`(select max(${sales.soldAt}) from ${sales}
  where ${sales.customerId} = ${customers.id} and ${sales.status} = 'paid')`;

function selectCustomers(db: DbOrTx) {
  return db
    .select({ customer: customers, saleCount: saleCountSql, lastSaleAt: lastSaleAtSql })
    .from(customers);
}

type Row = ReturnType<ReturnType<typeof selectCustomers>['all']>[number];

function toListItem({ customer: c, saleCount, lastSaleAt }: Row): CustomerListItem {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    lineId: c.lineId,
    address: c.address,
    notes: c.notes,
    archivedAt: toIsoOrNull(c.archivedAt),
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
    saleCount,
    lastSaleAt: toIsoOrNull(lastSaleAt),
  };
}

export function listCustomers(db: Db, query: ListCustomersFilters): Paginated<CustomerListItem> {
  const filters: SQL[] = [];
  if (!query.includeArchived) filters.push(isNull(customers.archivedAt));
  if (query.q) {
    // "081-234", "0812", and "+66 81…" all find 0812345678.
    const digits = normalizePhone(query.q);
    filters.push(
      or(
        contains(customers.name, query.q),
        contains(customers.phone, query.q),
        contains(customers.lineId, query.q),
        ...(digits.length >= 3
          ? [sql`${customers.phoneNormalized} LIKE ${`%${escapeLike(digits)}%`} ESCAPE '\\'`]
          : []),
      )!,
    );
  }
  const where = and(...filters);
  const rows = selectCustomers(db)
    .where(where)
    .orderBy(sql`${customers.archivedAt} is not null`, asc(customers.name), asc(customers.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(customers).where(where).get()!.n;
  return { items: rows.map(toListItem), total };
}

export function getCustomer(db: DbOrTx, id: number): CustomerListItem {
  const row = selectCustomers(db).where(eq(customers.id, id)).get();
  if (!row) throw CUSTOMER_NOT_FOUND();
  return toListItem(row);
}

/**
 * Other customers with the same phone number. The form shows them as a warning ("this may be an
 * existing customer") but never blocks: family members and shops share phone numbers.
 */
export function findPhoneMatches(
  db: DbOrTx,
  phone: string,
  excludeId?: number,
): CustomerPhoneMatch[] {
  const normalized = normalizePhone(phone);
  if (normalized.length < 6) return [];
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      archivedAt: customers.archivedAt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.phoneNormalized, normalized),
        ...(excludeId ? [ne(customers.id, excludeId)] : []),
      ),
    )
    .orderBy(asc(customers.id))
    .limit(10)
    .all()
    .map((c) => ({ ...c, archivedAt: toIsoOrNull(c.archivedAt) }));
}

export function createCustomer(
  db: Db,
  actor: SessionUser,
  rawInput: CustomerInput,
): CustomerListItem {
  const input = customerInputSchema.parse(rawInput);
  const id = db.transaction((tx) => {
    const row = tx
      .insert(customers)
      .values({ ...input, phoneNormalized: normalizePhone(input.phone) })
      .returning({ id: customers.id })
      .get();
    writeAudit(tx, {
      userId: actor.id,
      action: 'customer.create',
      entityType: 'customer',
      entityId: row.id,
      detail: { name: input.name },
    });
    return row.id;
  });
  return getCustomer(db, id);
}

export function updateCustomer(
  db: Db,
  actor: SessionUser,
  id: number,
  input: UpdateCustomerInput,
): CustomerListItem {
  db.transaction((tx) => {
    const before = tx.select().from(customers).where(eq(customers.id, id)).get();
    if (!before) throw CUSTOMER_NOT_FOUND();
    if (Object.keys(input).length === 0) return;
    tx.update(customers)
      .set({
        ...input,
        ...(input.phone !== undefined && { phoneNormalized: normalizePhone(input.phone) }),
      })
      .where(eq(customers.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'customer.update',
      entityType: 'customer',
      entityId: id,
      detail: { name: before.name, fields: Object.keys(input) },
    });
  });
  return getCustomer(db, id);
}

export function setCustomerArchived(
  db: Db,
  actor: SessionUser,
  id: number,
  archived: boolean,
): CustomerListItem {
  db.transaction((tx) => {
    const row = tx.select().from(customers).where(eq(customers.id, id)).get();
    if (!row) throw CUSTOMER_NOT_FOUND();
    tx.update(customers)
      .set({ archivedAt: archived ? Date.now() : null })
      .where(eq(customers.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: archived ? 'customer.archive' : 'customer.unarchive',
      entityType: 'customer',
      entityId: id,
      detail: { name: row.name },
    });
  });
  return getCustomer(db, id);
}

export const HISTORY_LIMIT = 200;

/** The customer's most recent purchases and returns (full shape; the route narrows it for staff). */
export function getCustomerHistory(
  db: Db,
  id: number,
): { sales: SaleListItemFull[]; returns: ReturnListItem[] } {
  getCustomer(db, id); // 404 for an unknown id
  const page = { page: 1, pageSize: HISTORY_LIMIT };
  return {
    sales: listSales(db, { ...page, customerId: id }).items,
    returns: listReturns(db, { ...page, pending: false }, { customerId: id }).items,
  };
}
