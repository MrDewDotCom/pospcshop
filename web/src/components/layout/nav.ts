import type { LucideIcon } from 'lucide-react';
import {
  FolderTree,
  History,
  House,
  Package,
  PackagePlus,
  ScanSearch,
  Settings,
  Truck,
  Users,
} from 'lucide-react';
import type { Permission } from '@pcshop/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Hidden unless the user has this permission. */
  permission?: Permission;
}

// Grows as Phase 1 modules are built (products, receiving, stock, …).
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'หน้าแรก', icon: House },
  { to: '/stock/lookup', label: 'เช็คสต็อก', icon: ScanSearch },
  { to: '/products', label: 'สินค้า', icon: Package },
  { to: '/receiving', label: 'รับสินค้าเข้า', icon: PackagePlus },
  { to: '/stock/movements', label: 'ความเคลื่อนไหวสต็อก', icon: History },
  { to: '/customers', label: 'ลูกค้า', icon: Users },
  { to: '/suppliers', label: 'ผู้จำหน่าย', icon: Truck },
  { to: '/categories', label: 'หมวดหมู่สินค้า', icon: FolderTree, permission: 'category.manage' },
  // Everyone: staff see only the tabs they may use (phone access).
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
];
