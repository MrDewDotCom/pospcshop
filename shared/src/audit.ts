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
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
