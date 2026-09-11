// Thai labels for audit log actions. New modules add their actions here as they are built.

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'setup.complete': 'ตั้งค่าร้านครั้งแรก',
  'auth.login': 'เข้าสู่ระบบ',
  'auth.change_password': 'เปลี่ยนรหัสผ่านของตัวเอง',
  'auth.recover': 'ตั้งรหัสผ่านใหม่ด้วยรหัสกู้คืน',
  'auth.cli_reset': 'รีเซ็ตรหัสผ่านจากเครื่องหลัก',
  'user.create': 'เพิ่มผู้ใช้',
  'user.update': 'แก้ไขผู้ใช้',
  'user.reset_password': 'ตั้งรหัสผ่านใหม่ให้ผู้ใช้',
  'settings.update': 'แก้ไขข้อมูลร้าน/ตั้งค่า',
  'sequence.update': 'แก้ไขรูปแบบเลขที่เอกสาร',
  'category.create': 'เพิ่มหมวดหมู่',
  'category.update': 'แก้ไขหมวดหมู่',
  'category.archive': 'ซ่อนหมวดหมู่',
  'category.unarchive': 'แสดงหมวดหมู่อีกครั้ง',
  'product.create': 'เพิ่มสินค้า',
  'product.update': 'แก้ไขสินค้า',
  'product.pricing_change': 'เปลี่ยนราคา/ต้นทุนสินค้า',
  'product.archive': 'ซ่อนสินค้า',
  'product.unarchive': 'แสดงสินค้าอีกครั้ง',
  'product.tags_change': 'เปลี่ยนแท็กของสินค้า',
  'tag.create': 'เพิ่มแท็ก',
  'tag.update': 'แก้ไขแท็ก',
  'tag.archive': 'ซ่อนแท็ก',
  'tag.unarchive': 'แสดงแท็กอีกครั้ง',
  'supplier.create': 'เพิ่มผู้จำหน่าย',
  'supplier.update': 'แก้ไขผู้จำหน่าย',
  'supplier.archive': 'ซ่อนผู้จำหน่าย',
  'supplier.unarchive': 'แสดงผู้จำหน่ายอีกครั้ง',
  'goods_receipt.create': 'รับสินค้าเข้า',
  'goods_receipt.cost_verify': 'ตรวจสอบ/แก้ไขต้นทุนใบรับสินค้า',
  'goods_receipt.void': 'ยกเลิกใบรับสินค้า',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
