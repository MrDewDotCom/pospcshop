// Enumerations shared by the DB schema (CHECK constraints), API schemas, and UI.
// Each list is `as const` so it can feed Drizzle `text({ enum })` and `z.enum()` directly.
// Thai labels live next to the values because they are shown in the UI and on documents.
// Later phases add their own enums (sales, returns, builds, …) here when they are built.

export const ROLES = ['owner', 'staff'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'เจ้าของร้าน',
  staff: 'พนักงาน',
};

export const PRODUCT_CONDITIONS = ['new', 'used'] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];
export const PRODUCT_CONDITION_LABELS: Record<ProductCondition, string> = {
  new: 'ใหม่',
  used: 'มือสอง',
};

export const WARRANTY_TYPES = ['distributor', 'shop', 'none'] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];
export const WARRANTY_TYPE_LABELS: Record<WarrantyType, string> = {
  distributor: 'ประกันศูนย์',
  shop: 'ประกันร้าน',
  none: 'ไม่มีประกัน',
};

export const CATEGORY_KINDS = [
  'cpu',
  'mainboard',
  'ram',
  'gpu',
  'storage',
  'psu',
  'case',
  'cooler',
  'monitor',
  'accessory',
  'service',
  'other',
] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  cpu: 'ซีพียู (CPU)',
  mainboard: 'เมนบอร์ด (Mainboard)',
  ram: 'แรม (RAM)',
  gpu: 'การ์ดจอ (GPU)',
  storage: 'อุปกรณ์จัดเก็บข้อมูล (Storage)',
  psu: 'พาวเวอร์ซัพพลาย (PSU)',
  case: 'เคส (Case)',
  cooler: 'ชุดระบายความร้อน (Cooler)',
  monitor: 'จอมอนิเตอร์ (Monitor)',
  accessory: 'อุปกรณ์เสริม',
  service: 'บริการ',
  other: 'อื่นๆ',
};

export const STOCK_MOVEMENT_TYPES = [
  'opening',
  'receive',
  'sale',
  'build_consume',
  'build_release',
  'adjustment',
  'return_restock',
  'trade_in',
  'void',
  'repair_use',
  'claim_out',
  'claim_in',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  opening: 'ยอดยกมา',
  receive: 'รับสินค้าเข้า',
  sale: 'ขาย',
  build_consume: 'ใช้ประกอบเครื่อง',
  build_release: 'รื้อเครื่องคืนสต็อก',
  adjustment: 'ปรับสต็อก',
  return_restock: 'รับคืนเข้าสต็อก',
  trade_in: 'รับซื้อ/เทิร์น',
  void: 'ยกเลิกเอกสาร',
  repair_use: 'ใช้ในงานซ่อม',
  claim_out: 'ส่งเคลม',
  claim_in: 'รับคืนจากเคลม',
};

export const SERIAL_STATUSES = [
  'in_stock',
  'in_build',
  'sold',
  'customer_returned',
  'in_claim',
  'returned_to_supplier',
  'written_off',
] as const;
export type SerialStatus = (typeof SERIAL_STATUSES)[number];
export const SERIAL_STATUS_LABELS: Record<SerialStatus, string> = {
  in_stock: 'พร้อมขาย',
  in_build: 'อยู่ในเครื่องประกอบ',
  sold: 'ขายแล้ว',
  customer_returned: 'สินค้าคืน – รอตรวจสอบ',
  in_claim: 'อยู่ระหว่างเคลม',
  returned_to_supplier: 'คืนผู้จำหน่ายแล้ว',
  written_off: 'ตัดจำหน่าย',
};

export const GOODS_RECEIPT_STATUSES = ['posted', 'voided'] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

export const COST_STATUSES = ['unverified', 'verified'] as const;
export type CostStatus = (typeof COST_STATUSES)[number];
export const COST_STATUS_LABELS: Record<CostStatus, string> = {
  unverified: 'รอตรวจสอบต้นทุน',
  verified: 'ตรวจสอบแล้ว',
};

/** Where a goods-receipt line's cost came from: typed on the receipt, or the product's average (left blank). */
export const COST_SOURCES = ['entered', 'average'] as const;
export type CostSource = (typeof COST_SOURCES)[number];

export const DOC_TYPES = [
  'sale',
  'return',
  'quote',
  'goods_receipt',
  'adjustment',
  'repair',
  'claim',
  'trade_in',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const SEQUENCE_RESET_POLICIES = ['never', 'yearly', 'monthly'] as const;
export type SequenceResetPolicy = (typeof SEQUENCE_RESET_POLICIES)[number];
