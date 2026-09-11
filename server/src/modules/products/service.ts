import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  STAFF_EDITABLE_PRODUCT_FIELDS,
  applyPriceChange,
  can,
  endDiscount,
  looksLikeThaiLayout,
  normalizeScannedCode,
  parseSpecs,
  thaiToQwerty,
  type CategoryKind,
  type CreateProductInput,
  type ListProductsFilters,
  type LookupMatch,
  type Paginated,
  type PriceHistoryEntry,
  type ProductImage,
  type ProductPricingInput,
  type SessionUser,
  type UpdateProductInput,
  createProductInputSchema,
} from '@pcshop/shared';
import type { AppDatabase } from '../../db/client';
import {
  categories,
  files,
  productImages,
  productPriceHistory,
  products,
  serialItems,
  users,
} from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import {
  RequestValidationError,
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../../lib/errors';
import { fileUrls } from '../../lib/files';
import { contains } from '../../lib/sql';
import { toIso, toIsoOrNull } from '../../lib/time';

type Db = AppDatabase;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;
type ProductRow = typeof products.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

/** Prefix for generated SKUs, e.g. CPU-0001. */
const SKU_PREFIX: Record<CategoryKind, string> = {
  cpu: 'CPU',
  mainboard: 'MB',
  ram: 'RAM',
  gpu: 'VGA',
  storage: 'SSD',
  psu: 'PSU',
  case: 'CASE',
  cooler: 'COOL',
  monitor: 'MON',
  accessory: 'ACC',
  service: 'SRV',
  other: 'ITEM',
};

const PRODUCT_NOT_FOUND = () => notFound('ไม่พบสินค้านี้');

// ---------- shaping ----------

/** List item in its full (owner) shape; routes narrow it for staff with respondByRole. */
export interface ProductListItemFull {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  categoryId: number;
  categoryName: string;
  categoryKind: CategoryKind;
  condition: ProductRow['condition'];
  warrantyType: ProductRow['warrantyType'];
  warrantyMonths: number;
  priceSatang: number | null;
  regularPriceSatang: number | null;
  costSatang: number;
  trackStock: boolean;
  serialRequired: boolean;
  minStock: number;
  onHand: number;
  specs: Record<string, unknown>;
  thumbUrl: string | null;
  archivedAt: string | null;
}

export interface ProductDetailFull extends ProductListItemFull {
  description: string;
  supplierWarrantyMonths: number;
  notes: string;
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

function toListItem(
  row: ProductRow,
  category: CategoryRow,
  thumbUrl: string | null,
): ProductListItemFull {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    categoryId: category.id,
    categoryName: category.name,
    categoryKind: category.kind,
    condition: row.condition,
    warrantyType: row.warrantyType,
    warrantyMonths: row.warrantyMonths,
    priceSatang: row.priceSatang,
    regularPriceSatang: row.regularPriceSatang,
    costSatang: row.costSatang,
    trackStock: row.trackStock,
    serialRequired: row.serialRequired,
    minStock: row.minStock,
    onHand: row.onHand,
    specs: row.specs,
    thumbUrl,
    archivedAt: toIsoOrNull(row.archivedAt),
  };
}

function imagesOf(db: DbOrTx, productId: number): ProductImage[] {
  return db
    .select({ fileId: files.id, path: files.path, thumbPath: files.thumbPath })
    .from(productImages)
    .innerJoin(files, eq(files.id, productImages.fileId))
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder))
    .all()
    .map((f) => ({ fileId: f.fileId, ...fileUrls(f) }));
}

/** First image's thumbnail, as a correlated subquery for lists. */
const thumbPathSql = sql<string | null>`(
  select coalesce(${files.thumbPath}, ${files.path})
  from ${productImages} join ${files} on ${files.id} = ${productImages.fileId}
  where ${productImages.productId} = ${products.id}
  order by ${productImages.sortOrder} limit 1
)`;

export function getProduct(db: DbOrTx, id: number): ProductDetailFull {
  const found = db
    .select({ product: products, category: categories })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, id))
    .get();
  if (!found) throw PRODUCT_NOT_FOUND();
  const { product, category } = found;
  const images = imagesOf(db, id);
  return {
    ...toListItem(product, category, images[0]?.thumbUrl ?? null),
    description: product.description,
    supplierWarrantyMonths: product.supplierWarrantyMonths,
    notes: product.notes,
    images,
    createdAt: toIso(product.createdAt),
    updatedAt: toIso(product.updatedAt),
  };
}

// ---------- list & lookup ----------

export function listProducts(db: Db, query: ListProductsFilters): Paginated<ProductListItemFull> {
  const filters: SQL[] = [];

  if (query.status === 'archived') filters.push(isNotNull(products.archivedAt));
  else filters.push(isNull(products.archivedAt));
  if (query.status === 'awaitingPrice') filters.push(isNull(products.priceSatang));

  if (query.q) {
    const text = query.q;
    const matchers: SQL[] = [
      contains(products.name, text),
      contains(products.brand, text),
      contains(products.sku, text),
      contains(products.barcode, text),
      sql`exists (select 1 from ${serialItems} where ${serialItems.productId} = ${products.id} and ${contains(serialItems.serialNo, text)})`,
    ];
    // A code typed with the Thai keyboard layout: also try its QWERTY form for codes.
    if (looksLikeThaiLayout(text)) {
      const qwerty = thaiToQwerty(text);
      matchers.push(contains(products.sku, qwerty), contains(products.barcode, qwerty));
    }
    filters.push(or(...matchers)!);
  }
  if (query.categoryId) filters.push(eq(products.categoryId, query.categoryId));
  if (query.condition) filters.push(eq(products.condition, query.condition));
  if (query.stock === 'in') filters.push(sql`${products.onHand} > 0`);
  if (query.stock === 'out')
    filters.push(and(eq(products.trackStock, true), sql`${products.onHand} <= 0`)!);
  // "Low" excludes "out" so they match the separate "ใกล้หมด" / "หมด" tags.
  if (query.stock === 'low') {
    filters.push(
      and(
        eq(products.trackStock, true),
        sql`${products.onHand} > 0`,
        sql`${products.onHand} <= ${products.minStock}`,
      )!,
    );
  }
  if (query.discounted) {
    filters.push(sql`${products.regularPriceSatang} > ${products.priceSatang}`);
  }

  const where = and(...filters);
  const orderBy = {
    name: [asc(products.name)],
    newest: [desc(products.id)],
    price: [sql`${products.priceSatang} is null`, asc(products.priceSatang)],
    stock: [asc(products.onHand), asc(products.name)],
  }[query.sort];

  const rows = db
    .select({ product: products, category: categories, thumbPath: thumbPathSql })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(...orderBy, asc(products.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const total = db.select({ n: count() }).from(products).where(where).get()!.n;

  return {
    total,
    items: rows.map(({ product, category, thumbPath }) =>
      toListItem(product, category, thumbPath ? `/uploads/${thumbPath}` : null),
    ),
  };
}

export interface LookupResult {
  product: ProductListItemFull;
  matchedBy: LookupMatch;
  code: string;
  serialItemId?: number;
}

/**
 * Exact match for scanners: barcode, then SKU, then serial number. If nothing matches and the code
 * contains Thai characters, the QWERTY form is tried too (scanner used with the Thai layout active).
 */
export function lookupProduct(db: Db, rawCode: string): LookupResult | null {
  const candidates = [...new Set([rawCode.trim(), normalizeScannedCode(rawCode)])].filter(Boolean);
  const active = isNull(products.archivedAt);
  const withCategory = (where: SQL) =>
    db
      .select({ product: products, category: categories, thumbPath: thumbPathSql })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(where, active))
      .get();
  const item = (row: NonNullable<ReturnType<typeof withCategory>>) =>
    toListItem(row.product, row.category, row.thumbPath ? `/uploads/${row.thumbPath}` : null);

  for (const code of candidates) {
    const byBarcode = withCategory(eq(products.barcode, code));
    if (byBarcode) return { product: item(byBarcode), matchedBy: 'barcode', code };

    const bySku = withCategory(sql`upper(${products.sku}) = upper(${code})`);
    if (bySku) return { product: item(bySku), matchedBy: 'sku', code };

    // Prefer a unit that is still in stock when the same serial exists more than once.
    const serial = db
      .select({ id: serialItems.id, productId: serialItems.productId })
      .from(serialItems)
      .where(sql`upper(${serialItems.serialNo}) = upper(${code})`)
      .orderBy(sql`${serialItems.status} <> 'in_stock'`)
      .get();
    if (serial) {
      const bySerial = withCategory(eq(products.id, serial.productId));
      if (bySerial) {
        return { product: item(bySerial), matchedBy: 'serial', code, serialItemId: serial.id };
      }
    }
  }
  return null;
}

// ---------- create & update ----------

function activeCategory(db: DbOrTx, id: number): CategoryRow {
  const category = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!category) throw badRequest('CATEGORY_NOT_FOUND', 'ไม่พบหมวดหมู่ที่เลือก');
  if (category.archivedAt)
    throw badRequest('CATEGORY_ARCHIVED', 'หมวดหมู่นี้ถูกซ่อนอยู่ กรุณาเลือกหมวดหมู่อื่น');
  return category;
}

function validSpecs(kind: CategoryKind, specs: Record<string, unknown>) {
  const result = parseSpecs(kind, specs);
  if (!result.ok) throw new RequestValidationError(result.errors, 'body');
  return result.specs;
}

function generateSku(db: DbOrTx, kind: CategoryKind): string {
  const prefix = SKU_PREFIX[kind];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highest = db
    .select({ sku: products.sku })
    .from(products)
    .where(sql`${products.sku} LIKE ${`${prefix}-%`}`)
    .all()
    .reduce((max, { sku }) => Math.max(max, Number(pattern.exec(sku)?.[1] ?? 0)), 0);
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

function assertCodesFree(db: DbOrTx, sku: string, barcode: string | null, exceptId?: number) {
  const skuOwner = db
    .select({ id: products.id })
    .from(products)
    .where(sql`upper(${products.sku}) = upper(${sku})`)
    .get();
  if (skuOwner && skuOwner.id !== exceptId)
    throw conflict('SKU_TAKEN', `รหัสสินค้า ${sku} ถูกใช้แล้ว`);
  if (barcode) {
    const barcodeOwner = db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.barcode, barcode))
      .get();
    if (barcodeOwner && barcodeOwner.id !== exceptId) {
      throw conflict('BARCODE_TAKEN', `บาร์โค้ดนี้ใช้กับสินค้า "${barcodeOwner.name}" อยู่แล้ว`);
    }
  }
}

function assertFilesExist(db: DbOrTx, fileIds: number[]) {
  if (fileIds.length === 0) return;
  const found = db.select({ id: files.id }).from(files).where(inArray(files.id, fileIds)).all();
  if (found.length !== new Set(fileIds).size)
    throw badRequest('FILE_NOT_FOUND', 'ไม่พบไฟล์รูปบางรูป กรุณาอัปโหลดใหม่');
}

function replaceImages(db: DbOrTx, productId: number, fileIds: number[]) {
  const unique = [...new Set(fileIds)];
  assertFilesExist(db, unique);
  db.delete(productImages).where(eq(productImages.productId, productId)).run();
  if (unique.length) {
    db.insert(productImages)
      .values(unique.map((fileId, index) => ({ productId, fileId, sortOrder: index })))
      .run();
  }
}

function recordPriceHistory(
  db: DbOrTx,
  productId: number,
  state: { priceSatang: number | null; regularPriceSatang: number | null },
  userId: number,
) {
  db.insert(productPriceHistory)
    .values({ productId, ...state, changedBy: userId, changedAt: Date.now() })
    .run();
}

function normalizeBarcode(barcode: string | undefined): string | null {
  const code = barcode ? normalizeScannedCode(barcode) : '';
  return code === '' ? null : code;
}

export function createProduct(
  db: Db,
  actor: SessionUser,
  rawInput: CreateProductInput,
): ProductDetailFull {
  const input = createProductInputSchema.parse(rawInput);
  if (input.pricing && !can(actor.role, 'product.editPricing')) {
    throw forbidden(
      'FORBIDDEN_FIELDS',
      'พนักงานกำหนดราคาไม่ได้ สินค้าจะอยู่ในสถานะ "รอตั้งราคา" จนกว่าเจ้าของร้านจะตั้งราคา',
    );
  }
  if (input.serialRequired && !input.trackStock) {
    throw badRequest('SERIAL_WITHOUT_STOCK', 'สินค้าที่ไม่นับสต็อกบังคับซีเรียลไม่ได้');
  }

  const id = db.transaction((tx) => {
    const category = activeCategory(tx, input.categoryId);
    const specs = validSpecs(category.kind, input.specs);
    const sku = input.sku ? input.sku.toUpperCase() : generateSku(tx, category.kind);
    const barcode = normalizeBarcode(input.barcode);
    assertCodesFree(tx, sku, barcode);

    const pricing = input.pricing
      ? applyPriceChange({ priceSatang: null, regularPriceSatang: null }, input.pricing)
      : { priceSatang: null, regularPriceSatang: null };

    const row = tx
      .insert(products)
      .values({
        sku,
        barcode,
        name: input.name,
        brand: input.brand,
        categoryId: category.id,
        description: input.description,
        specs,
        condition: input.condition,
        warrantyType: input.warrantyType,
        warrantyMonths: input.warrantyMonths,
        supplierWarrantyMonths: input.supplierWarrantyMonths,
        trackStock: input.trackStock,
        serialRequired: input.serialRequired,
        minStock: input.minStock,
        notes: input.notes,
        ...pricing,
        costSatang: input.pricing?.costSatang ?? 0,
        createdBy: actor.id,
      })
      .returning({ id: products.id })
      .get();

    replaceImages(tx, row.id, input.imageFileIds);
    if (pricing.priceSatang !== null) recordPriceHistory(tx, row.id, pricing, actor.id);
    writeAudit(tx, {
      userId: actor.id,
      action: 'product.create',
      entityType: 'product',
      entityId: row.id,
      detail: { sku, name: input.name },
    });
    return row.id;
  });
  return getProduct(db, id);
}

export function updateProduct(
  db: Db,
  actor: SessionUser,
  id: number,
  input: UpdateProductInput,
): ProductDetailFull {
  const keys = Object.keys(input) as (keyof UpdateProductInput)[];
  if (!can(actor.role, 'product.editCore')) {
    const notAllowed = keys.filter(
      (key) => !(STAFF_EDITABLE_PRODUCT_FIELDS as readonly string[]).includes(key),
    );
    if (notAllowed.length > 0) {
      throw forbidden('FORBIDDEN_FIELDS', 'พนักงานแก้ไขได้เฉพาะรูป คำอธิบาย และสเปกของสินค้า');
    }
  }

  db.transaction((tx) => {
    const before = tx.select().from(products).where(eq(products.id, id)).get();
    if (!before) throw PRODUCT_NOT_FOUND();
    const categoryChanged =
      input.categoryId !== undefined && input.categoryId !== before.categoryId;
    // Only a newly chosen category must be active; the current one may have been archived since.
    const category = categoryChanged
      ? activeCategory(tx, input.categoryId!)
      : tx.select().from(categories).where(eq(categories.id, before.categoryId)).get()!;

    const changes: Partial<typeof products.$inferInsert> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.brand !== undefined) changes.brand = input.brand;
    if (input.description !== undefined) changes.description = input.description;
    if (input.notes !== undefined) changes.notes = input.notes;
    if (input.condition !== undefined) changes.condition = input.condition;
    if (input.warrantyType !== undefined) changes.warrantyType = input.warrantyType;
    if (input.warrantyMonths !== undefined) changes.warrantyMonths = input.warrantyMonths;
    if (input.supplierWarrantyMonths !== undefined)
      changes.supplierWarrantyMonths = input.supplierWarrantyMonths;
    if (input.minStock !== undefined) changes.minStock = input.minStock;
    if (categoryChanged) changes.categoryId = category.id;
    // Specs are always re-checked against the (possibly new) category's definition.
    if (input.specs !== undefined || categoryChanged) {
      changes.specs = validSpecs(category.kind, input.specs ?? before.specs);
    }

    const sku = input.sku ? input.sku.toUpperCase() : before.sku;
    const barcode = input.barcode !== undefined ? normalizeBarcode(input.barcode) : before.barcode;
    if (sku !== before.sku || barcode !== before.barcode) {
      assertCodesFree(tx, sku, barcode, id);
      changes.sku = sku;
      changes.barcode = barcode;
    }

    const trackStock = input.trackStock ?? before.trackStock;
    const serialRequired = input.serialRequired ?? before.serialRequired;
    if (trackStock !== before.trackStock || serialRequired !== before.serialRequired) {
      if (before.onHand !== 0) {
        throw conflict(
          'STOCK_SETTINGS_LOCKED',
          `เปลี่ยนการนับสต็อก/ซีเรียลได้เฉพาะตอนที่สินค้าคงเหลือเป็น 0 (ตอนนี้เหลือ ${before.onHand})`,
        );
      }
      if (serialRequired && !trackStock) {
        throw badRequest('SERIAL_WITHOUT_STOCK', 'สินค้าที่ไม่นับสต็อกบังคับซีเรียลไม่ได้');
      }
      changes.trackStock = trackStock;
      changes.serialRequired = serialRequired;
    }

    if (Object.keys(changes).length === 0) return;
    tx.update(products).set(changes).where(eq(products.id, id)).run();
    writeAudit(tx, {
      userId: actor.id,
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      detail: { sku: before.sku, fields: Object.keys(changes) },
    });
  });
  return getProduct(db, id);
}

/** Replaces the product's images (in order). Staff may do this. */
export function setProductImages(db: Db, id: number, fileIds: number[]): ProductDetailFull {
  db.transaction((tx) => {
    if (!tx.select({ id: products.id }).from(products).where(eq(products.id, id)).get()) {
      throw PRODUCT_NOT_FOUND();
    }
    replaceImages(tx, id, fileIds);
  });
  return getProduct(db, id);
}

// ---------- pricing (owner only) ----------

function changePricing(
  db: Db,
  actor: SessionUser,
  id: number,
  compute: (before: ProductRow) => {
    priceSatang: number | null;
    regularPriceSatang: number | null;
    costSatang: number;
  },
): ProductDetailFull {
  db.transaction((tx) => {
    const before = tx.select().from(products).where(eq(products.id, id)).get();
    if (!before) throw PRODUCT_NOT_FOUND();
    const next = compute(before);
    const priceChanged =
      next.priceSatang !== before.priceSatang ||
      next.regularPriceSatang !== before.regularPriceSatang;
    if (!priceChanged && next.costSatang === before.costSatang) return;

    tx.update(products).set(next).where(eq(products.id, id)).run();
    if (priceChanged) recordPriceHistory(tx, id, next, actor.id);
    writeAudit(tx, {
      userId: actor.id,
      action: 'product.pricing_change',
      entityType: 'product',
      entityId: id,
      detail: {
        sku: before.sku,
        from: {
          price: before.priceSatang,
          regular: before.regularPriceSatang,
          cost: before.costSatang,
        },
        to: { price: next.priceSatang, regular: next.regularPriceSatang, cost: next.costSatang },
      },
    });
  });
  return getProduct(db, id);
}

export function setProductPricing(
  db: Db,
  actor: SessionUser,
  id: number,
  input: ProductPricingInput,
) {
  return changePricing(db, actor, id, (before) => ({
    ...applyPriceChange(before, {
      priceSatang: input.priceSatang,
      regularPriceSatang: input.regularPriceSatang,
    }),
    costSatang: input.costSatang ?? before.costSatang,
  }));
}

export function endProductDiscount(db: Db, actor: SessionUser, id: number) {
  return changePricing(db, actor, id, (before) => ({
    ...endDiscount(before),
    costSatang: before.costSatang,
  }));
}

export function listPriceHistory(db: Db, id: number): PriceHistoryEntry[] {
  return db
    .select({ entry: productPriceHistory, changedByName: users.name })
    .from(productPriceHistory)
    .leftJoin(users, eq(users.id, productPriceHistory.changedBy))
    .where(eq(productPriceHistory.productId, id))
    .orderBy(desc(productPriceHistory.id))
    .limit(50)
    .all()
    .map(({ entry, changedByName }) => ({
      id: entry.id,
      changedAt: toIso(entry.changedAt),
      priceSatang: entry.priceSatang,
      regularPriceSatang: entry.regularPriceSatang,
      changedByName,
    }));
}

// ---------- archive ----------

export function setProductArchived(db: Db, actor: SessionUser, id: number, archived: boolean) {
  db.transaction((tx) => {
    const row = tx.select().from(products).where(eq(products.id, id)).get();
    if (!row) throw PRODUCT_NOT_FOUND();
    if (archived && row.onHand !== 0) {
      throw conflict(
        'PRODUCT_HAS_STOCK',
        `ยังมีสินค้าคงเหลือ ${row.onHand} ชิ้น กรุณาปรับสต็อกให้เป็น 0 ก่อนซ่อนสินค้า`,
      );
    }
    if (!archived) activeCategory(tx, row.categoryId);
    tx.update(products)
      .set({ archivedAt: archived ? Date.now() : null })
      .where(eq(products.id, id))
      .run();
    writeAudit(tx, {
      userId: actor.id,
      action: archived ? 'product.archive' : 'product.unarchive',
      entityType: 'product',
      entityId: id,
      detail: { sku: row.sku, name: row.name },
    });
  });
  return getProduct(db, id);
}
