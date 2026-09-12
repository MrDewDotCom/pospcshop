import { isRouteErrorResponse, useRouteError } from 'react-router';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Last resort when a screen throws while rendering: without this the shop would see a blank white page
 * (LAN is plain http and there is no remote error reporting, so the message has to help them here).
 * Reloading is safe: nothing is kept in the browser, all data lives on the shop's server.
 */
export function CrashPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <CircleAlert className="size-10 text-destructive" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">หน้านี้มีปัญหา</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          ข้อมูลของร้านยังอยู่ครบ ไม่มีอะไรหาย ลองโหลดหน้าใหม่อีกครั้ง ถ้ายังไม่หาย
          กรุณาแจ้งผู้ดูแลระบบพร้อมข้อความด้านล่าง
        </p>
      </div>
      <pre className="max-w-lg overflow-x-auto rounded-md border bg-muted/50 p-3 text-left text-xs whitespace-pre-wrap">
        {detail}
      </pre>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>โหลดหน้านี้ใหม่</Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          กลับหน้าแรก
        </Button>
      </div>
    </div>
  );
}
