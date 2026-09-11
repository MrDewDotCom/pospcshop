import { asc, count, eq, isNull, max, sql } from 'drizzle-orm';
import type { CreateTagInput, SessionUser, Tag, UpdateTagInput } from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import { productTags, products, tags } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { toIsoOrNull } from '../../lib/time';

type DbOrTx = Pick<AppDatabase, 'select' | 'insert' | 'update'>;

const TAG_NOT_FOUND = () => notFound('ไม่พบแท็กนี้');

export function listTags(db: AppDatabase, includeArchived = false): Tag[] {
  const productCount = db
    .select({ tagId: productTags.tagId, n: count().as('n') })
    .from(productTags)
    .innerJoin(products, eq(products.id, productTags.productId))
    .where(isNull(products.archivedAt))
    .groupBy(productTags.tagId)
    .as('product_count');

  return db
    .select({ tag: tags, productCount: productCount.n })
    .from(tags)
    .leftJoin(productCount, eq(productCount.tagId, tags.id))
    .where(includeArchived ? undefined : isNull(tags.archivedAt))
    .orderBy(asc(tags.sortOrder), asc(tags.id))
    .all()
    .map(({ tag, productCount: n }) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color as Tag['color'],
      sortOrder: tag.sortOrder,
      archivedAt: toIsoOrNull(tag.archivedAt),
      productCount: n ?? 0,
    }));
}

function getTag(db: AppDatabase, id: number): Tag {
  const found = listTags(db, true).find((t) => t.id === id);
  if (!found) throw TAG_NOT_FOUND();
  return found;
}

function assertNameFree(db: DbOrTx, name: string, exceptId?: number): void {
  const clash = db
    .select({ id: tags.id })
    .from(tags)
    .where(sql`lower(${tags.name}) = lower(${name})`)
    .all()
    .find((row) => row.id !== exceptId);
  if (clash) throw conflict('TAG_NAME_TAKEN', 'มีแท็กชื่อนี้อยู่แล้ว');
}

export function createTag(db: AppDatabase, actor: SessionUser, input: CreateTagInput): Tag {
  const id = db.transaction((tx) => {
    assertNameFree(tx, input.name);
    const last =
      tx
        .select({ max: max(tags.sortOrder) })
        .from(tags)
        .get()?.max ?? 0;
    const row = tx
      .insert(tags)
      .values({ name: input.name, color: input.color, sortOrder: last + 10 })
      .returning({ id: tags.id })
      .get();
    writeAudit(tx, {
      userId: actor.id,
      action: 'tag.create',
      entityType: 'tag',
      entityId: row.id,
      detail: { name: input.name, color: input.color },
    });
    return row.id;
  });
  return getTag(db, id);
}

export function updateTag(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  input: UpdateTagInput,
): Tag {
  db.transaction((tx) => {
    const before = tx.select().from(tags).where(eq(tags.id, id)).get();
    if (!before) throw TAG_NOT_FOUND();
    if (input.name) assertNameFree(tx, input.name, id);
    tx.update(tags).set(input).where(eq(tags.id, id)).run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'tag.update',
      entityType: 'tag',
      entityId: id,
      detail: { from: { name: before.name, color: before.color }, to: input },
    });
  });
  return getTag(db, id);
}

/**
 * Archiving hides the tag everywhere but keeps its assignments, so unarchiving brings it back on the
 * same products.
 */
export function setTagArchived(
  db: AppDatabase,
  actor: SessionUser,
  id: number,
  archived: boolean,
): Tag {
  db.transaction((tx) => {
    const row = tx.select().from(tags).where(eq(tags.id, id)).get();
    if (!row) throw TAG_NOT_FOUND();
    tx.update(tags)
      .set({ archivedAt: archived ? Date.now() : null })
      .where(eq(tags.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: archived ? 'tag.archive' : 'tag.unarchive',
      entityType: 'tag',
      entityId: id,
      detail: { name: row.name },
    });
  });
  return getTag(db, id);
}

/** Sets the display order to the given id order (ids not listed keep their relative order after). */
export function reorderTags(db: AppDatabase, ids: number[]): Tag[] {
  db.transaction((tx) => {
    const all = tx
      .select({ id: tags.id })
      .from(tags)
      .orderBy(asc(tags.sortOrder), asc(tags.id))
      .all()
      .map((r) => r.id);
    const unknown = ids.filter((id) => !all.includes(id));
    if (unknown.length) throw badRequest('UNKNOWN_TAG', 'มีแท็กที่ไม่รู้จัก');
    const ordered = [...new Set(ids), ...all.filter((id) => !ids.includes(id))];
    ordered.forEach((id, index) =>
      tx
        .update(tags)
        .set({ sortOrder: (index + 1) * 10 })
        .where(eq(tags.id, id))
        .run(),
    );
  });
  return listTags(db, true);
}
