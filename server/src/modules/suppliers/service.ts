import { and, asc, count, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import type {
  Paginated,
  SessionUser,
  Supplier,
  SupplierInput,
  UpdateSupplierInput,
} from '@pcshop/shared';
import { supplierInputSchema } from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { suppliers } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { conflict, notFound } from '../../lib/errors';
import { contains } from '../../lib/sql';
import { toIso, toIsoOrNull } from '../../lib/time';

type Row = typeof suppliers.$inferSelect;
type DbOrTx = Pick<AppDatabase, 'select'>;

const SUPPLIER_NOT_FOUND = () => notFound('ไม่พบผู้จำหน่ายนี้');

function toSupplier(row: Row): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    lineId: row.lineId,
    address: row.address,
    notes: row.notes,
    archivedAt: toIsoOrNull(row.archivedAt),
    createdAt: toIso(row.createdAt),
  };
}

export function listSuppliers(
  db: AppDatabase,
  query: { q?: string; includeArchived: boolean; page: number; pageSize: number },
): Paginated<Supplier> {
  const filters: SQL[] = [];
  if (!query.includeArchived) filters.push(isNull(suppliers.archivedAt));
  if (query.q) {
    filters.push(
      or(
        contains(suppliers.name, query.q),
        contains(suppliers.contactName, query.q),
        contains(suppliers.phone, query.q),
      )!,
    );
  }
  const where = and(...filters);
  const rows = db
    .select()
    .from(suppliers)
    .where(where)
    .orderBy(sql`${suppliers.archivedAt} is not null`, asc(suppliers.name), asc(suppliers.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(suppliers).where(where).get()!.n;
  return { items: rows.map(toSupplier), total };
}

export function getSupplier(db: DbOrTx, id: number): Supplier {
  const row = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
  if (!row) throw SUPPLIER_NOT_FOUND();
  return toSupplier(row);
}

function assertNameFree(db: DbOrTx, name: string, exceptId?: number) {
  const clash = db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(sql`lower(${suppliers.name}) = lower(${name})`)
    .all()
    .find((row) => row.id !== exceptId);
  if (clash) throw conflict('SUPPLIER_NAME_TAKEN', 'มีผู้จำหน่ายชื่อนี้อยู่แล้ว');
}

export function createSupplier(
  db: AppDatabase,
  actor: SessionUser,
  rawInput: SupplierInput,
): Supplier {
  const input = supplierInputSchema.parse(rawInput);
  const id = db.transaction((tx) => {
    assertNameFree(tx, input.name);
    const row = tx.insert(suppliers).values(input).returning({ id: suppliers.id }).get();
    writeAudit(tx, {
      userId: actor.id,
      action: 'supplier.create',
      entityType: 'supplier',
      entityId: row.id,
      detail: { name: input.name },
    });
    return row.id;
  });
  return getSupplier(db, id);
}

export function updateSupplier(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  input: UpdateSupplierInput,
): Supplier {
  db.transaction((tx) => {
    const before = tx.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!before) throw SUPPLIER_NOT_FOUND();
    if (input.name) assertNameFree(tx, input.name, id);
    if (Object.keys(input).length === 0) return;
    tx.update(suppliers).set(input).where(eq(suppliers.id, id)).run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'supplier.update',
      entityType: 'supplier',
      entityId: id,
      detail: { name: before.name, fields: Object.keys(input) },
    });
  });
  return getSupplier(db, id);
}

export function setSupplierArchived(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  archived: boolean,
): Supplier {
  db.transaction((tx) => {
    const row = tx.select().from(suppliers).where(eq(suppliers.id, id)).get();
    if (!row) throw SUPPLIER_NOT_FOUND();
    tx.update(suppliers)
      .set({ archivedAt: archived ? Date.now() : null })
      .where(eq(suppliers.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: archived ? 'supplier.archive' : 'supplier.unarchive',
      entityType: 'supplier',
      entityId: id,
      detail: { name: row.name },
    });
  });
  return getSupplier(db, id);
}
