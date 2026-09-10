import { NavLink, Outlet, useNavigate } from 'react-router';
import { ChevronDown, LogOut, Menu, Monitor, UserRound } from 'lucide-react';
import { cn } from 'cn';
import { ROLE_LABELS } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser, useLogout, useSetupStatus } from '@/features/auth/queries';
import { NAV_ITEMS } from './nav';

function useVisibleNav() {
  const user = useCurrentUser();
  return NAV_ITEMS.filter((item) => !item.permission || user.can(item.permission));
}

function UserMenu() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <UserRound />
          <span className="max-w-32 truncate">{user.name}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate">{user.name}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {ROLE_LABELS[user.role]} · {user.username}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/account')}>
          <UserRound />
          บัญชีของฉัน
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate()}>
          <LogOut />
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone navigation: the same items in a dropdown (a bottom bar comes with the phone screens). */
function MobileNav() {
  const items = useVisibleNav();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="เมนู">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {items.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => navigate(item.to)}>
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const { data: status } = useSetupStatus();
  const items = useVisibleNav();

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background px-3 md:px-4">
        <MobileNav />
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <Monitor className="size-5 shrink-0 text-primary" />
          <span className="truncate">{status?.shopName ?? 'PC Shop Manager'}</span>
        </div>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r bg-background p-3 md:flex">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted',
                  isActive && 'bg-muted font-medium',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
