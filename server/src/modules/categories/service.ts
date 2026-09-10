import { and, asc, count, eq, isNull, max, sql } from 'drizzle-orm';
import type {
  Category,
  CreateCategoryInput,
  SessionUser,
  UpdateCategoryInput,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { categories, products } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { toIsoOrNull } from '../../lib/time';

type DbOrTx = Pick<AppDatabase, 'select' | 'insert' | 'update'>;

const CATEGORY_NOT_FOUND = () => notFound('ไม่พบหมวดหมู่นี้');

export function listCategories(db: AppDatabase, includeArchived = false): Category[] {
  const productCount = db
    .select({ categoryId: products.categoryId, n: count().as('n') })
    .from(products)
    .where(isNull(products.archivedAt))
    .groupBy(products.categoryId)
    .as('product_count');

  return db
    .select({ category: categories, productCount: productCount.n })
    .from(categories)
    .leftJoin(productCount, eq(productCount.categoryId, categories.id))
    .where(includeArchived ? undefined : isNull(categories.archivedAt))
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all()
    .map(({ category, productCount: n }) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      sortOrder: category.sortOrder,
      isSystem: category.isSystem,
      archivedAt: toIsoOrNull(category.archivedAt),
      productCount: n ?? 0,
    }));
}

function getCategory(db: AppDatabase, id: number): Category {
  const found = listCategories(db, true).find((c) => c.id === id);
  if (!found) throw CATEGORY_NOT_FOUND();
  return found;
}

function assertNameFree(db: DbOrTx, name: string, exceptId?: number): void {
  const clash = db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${name})`)
    .all()
    .find((row) => row.id !== exceptId);
  if (clash) throw conflict('CATEGORY_NAME_TAKEN', 'มีหมวดหมู่ชื่อนี้อยู่แล้ว');
}

export function createCategory(
  db: AppDatabase,
  actor: SessionUser,
  input: CreateCategoryInput,
): Category {
  const id = db.transaction((tx) => {
    assertNameFree(tx, input.name);
    const last =
      tx
        .select({ max: max(categories.sortOrder) })
        .from(categories)
        .get()?.max ?? 0;
    const row = tx
      .insert(categories)
      .values({ name: input.name, kind: input.kind, sortOrder: last + 10 })
      .returning({ id: categories.id })
      .get();
    writeAudit(tx, {
      userId: actor.id,
      action: 'category.create',
      entityType: 'category',
      entityId: row.id,
      detail: { name: input.name, kind: input.kind },
    });
    return row.id;
  });
  return getCategory(db, id);
}

export function updateCategory(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  input: UpdateCategoryInput,
): Category {
  db.transaction((tx) => {
    const before = tx.select().from(categories).where(eq(categories.id, id)).get();
    if (!before) throw CATEGORY_NOT_FOUND();
    if (input.kind && input.kind !== before.kind && before.isSystem) {
      throw badRequest(
        'SYSTEM_CATEGORY_KIND',
        'หมวดหมู่หลักของระบบเปลี่ยนชนิดไม่ได้ (เปลี่ยนได้เฉพาะชื่อ)',
      );
    }
    if (input.name) assertNameFree(tx, input.name, id);
    tx.update(categories).set(input).where(eq(categories.id, id)).run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'category.update',
      entityType: 'category',
      entityId: id,
      detail: { from: { name: before.name, kind: before.kind }, to: input },
    });
  });
  return getCategory(db, id);
}

export function setCategoryArchived(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  archived: boolean,
): Category {
  db.transaction((tx) => {
    const row = tx.select().from(categories).where(eq(categories.id, id)).get();
    if (!row) throw CATEGORY_NOT_FOUND();
    if (archived && row.isSystem) {
      throw badRequest('SYSTEM_CATEGORY', 'หมวดหมู่หลักของระบบซ่อนไม่ได้');
    }
    if (archived) {
      const active = tx
        .select({ n: count() })
        .from(products)
        .where(and(eq(products.categoryId, id), isNull(products.archivedAt)))
        .get()!.n;
      if (active > 0) {
        throw conflict(
          'CATEGORY_IN_USE',
          `ยังมีสินค้า ${active} รายการในหมวดหมู่นี้ กรุณาย้ายหรือซ่อนสินค้าก่อน`,
        );
      }
    }
    tx.update(categories)
      .set({ archivedAt: archived ? Date.now() : null })
      .where(eq(categories.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: archived ? 'category.archive' : 'category.unarchive',
      entityType: 'category',
      entityId: id,
      detail: { name: row.name },
    });
  });
  return getCategory(db, id);
}

/** Sets the display order to the given id order (ids not listed keep their relative order after). */
export function reorderCategories(db: AppDatabase, ids: number[]): Category[] {
  db.transaction((tx) => {
    const all = tx
      .select({ id: categories.id })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id))
      .all()
      .map((r) => r.id);
    const unknown = ids.filter((id) => !all.includes(id));
    if (unknown.length) throw badRequest('UNKNOWN_CATEGORY', 'มีหมวดหมู่ที่ไม่รู้จัก');
    const ordered = [...new Set(ids), ...all.filter((id) => !ids.includes(id))];
    ordered.forEach((id, index) =>
      tx
        .update(categories)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(categories.id, id))
        .run(),
    );
  });
  return listCategories(db, true);
}
