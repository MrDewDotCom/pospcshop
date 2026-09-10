import type { LucideIcon } from 'lucide-react';
import { House } from 'lucide-react';
import type { Permission } from '@pcshop/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Hidden unless the user has this permission. */
  permission?: Permission;
}

// Grows as Phase 1 modules are built (products, receiving, stock, settings, …).
export const NAV_ITEMS: NavItem[] = [{ to: '/', label: 'หน้าแรก', icon: House }];
