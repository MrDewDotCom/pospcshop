import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { cn } from 'cn';
import type { Permission } from '@pcshop/shared';
import { useCurrentUser } from '@/features/auth/queries';

interface SettingsTab {
  to: string;
  label: string;
  permission?: Permission;
}

const TABS: SettingsTab[] = [
  { to: '/settings/shop', label: 'ข้อมูลร้าน', permission: 'settings.manage' },
  { to: '/settings/tags', label: 'แท็กสินค้า', permission: 'tag.manage' },
  { to: '/settings/numbering', label: 'เลขที่เอกสาร', permission: 'settings.manage' },
  { to: '/settings/users', label: 'ผู้ใช้งาน', permission: 'users.manage' },
  { to: '/settings/backup', label: 'สำรองข้อมูล', permission: 'backup.manage' },
  { to: '/settings/sample-data', label: 'ข้อมูลตัวอย่าง', permission: 'settings.manage' },
  { to: '/settings/network', label: 'เชื่อมต่อมือถือ' },
  { to: '/settings/audit', label: 'ประวัติการใช้งาน', permission: 'audit.view' },
];

export function SettingsLayout() {
  const user = useCurrentUser();
  const { pathname } = useLocation();
  const tabs = TABS.filter((tab) => !tab.permission || user.can(tab.permission));

  if (pathname === '/settings' || pathname === '/settings/') {
    return tabs[0] ? <Navigate to={tabs[0].to} replace /> : <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground',
                isActive && 'border-primary font-medium text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
