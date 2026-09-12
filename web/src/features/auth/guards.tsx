import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { ShieldOff } from 'lucide-react';
import type { Permission } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { errorMessage } from '@/lib/api';
import { useCurrentUser, useMe, useSetupStatus } from './queries';

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-destructive">{errorMessage(error)}</p>
      <Button variant="outline" onClick={retry}>
        ลองอีกครั้ง
      </Button>
    </div>
  );
}

/** Sends everyone to the setup wizard until the shop has been set up, and away from it afterwards. */
export function SetupGate() {
  const { data, error, isPending, refetch } = useSetupStatus();
  const { pathname } = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (error) return <LoadError error={error} retry={refetch} />;
  if (data.needsSetup && pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (!data.needsSetup && pathname === '/setup') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Only for logged-in users; others go to the login page (and come back afterwards). */
export function RequireAuth() {
  const { data, error, isPending, refetch } = useMe();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (error) return <LoadError error={error} retry={refetch} />;
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/**
 * Owner-only screens. The server enforces permissions on every request (that's the real protection);
 * this only keeps staff who type a URL from filling in a form that would be refused at the end.
 */
export function RequirePermission({ permission }: { permission: Permission }) {
  const user = useCurrentUser();
  if (user.can(permission)) return <Outlet />;
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 text-center">
      <ShieldOff className="size-10 text-muted-foreground" />
      <div>
        <p className="font-medium">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        <p className="text-sm text-muted-foreground">หน้านี้สำหรับเจ้าของร้านเท่านั้น</p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">กลับหน้าแรก</Link>
      </Button>
    </div>
  );
}

/** Login/recovery pages: a logged-in user is sent to the app instead. */
export function GuestOnly() {
  const { data, isPending } = useMe();
  if (isPending) return <FullPageSpinner />;
  if (data) return <Navigate to="/" replace />;
  return <Outlet />;
}
