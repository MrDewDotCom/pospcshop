import type { LucideIcon } from 'lucide-react';
import { House, Settings } from 'lucide-react';
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
  // Everyone: staff see only the tabs they may use (phone access).
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
];
