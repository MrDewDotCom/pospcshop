import { useState } from 'react';
import { Smartphone, Wifi } from 'lucide-react';
import type { NetworkAddress } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { QrCode } from '@/components/QrCode';
import { errorMessage } from '@/lib/api';
import { useNetworkInfo } from './queries';

/**
 * The URL a phone should open. We reuse the port the browser is using right now: in development
 * that's the Vite port (5173), in production the app's own port (3300).
 */
function urlFor(address: NetworkAddress): string {
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${address.address}${port}`;
}

function useLanUrls() {
  const query = useNetworkInfo();
  const addresses = query.data?.addresses ?? [];
  const best = addresses.find((a) => a.recommended) ?? addresses[0];
  return { ...query, addresses, best };
}

/** Header button: shows the QR code to open the app on a phone. */
export function PhoneAccessButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="เปิดบนมือถือ" title="เปิดบนมือถือ">
          <Smartphone />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>เปิดบนมือถือ</DialogTitle>
          <DialogDescription>ต่อ WiFi เดียวกับร้าน แล้วสแกน QR ด้วยกล้องมือถือ</DialogDescription>
        </DialogHeader>
        {open && <QuickQr />}
      </DialogContent>
    </Dialog>
  );
}

function QuickQr() {
  const { best, isPending, error } = useLanUrls();
  if (isPending) return <p className="text-muted-foreground">กำลังค้นหาที่อยู่เครื่อง…</p>;
  if (error) return <p className="text-destructive">{errorMessage(error)}</p>;
  if (!best)
    return <p>ไม่พบการเชื่อมต่อเครือข่าย กรุณาตรวจสอบว่าเครื่องนี้ต่อ WiFi หรือสาย LAN อยู่</p>;
  const url = urlFor(best);
  return (
    <div className="flex flex-col items-center gap-3">
      <QrCode text={url} size={220} />
      <p className="font-mono text-lg font-semibold break-all">{url}</p>
    </div>
  );
}

export function PhoneAccessPage() {
  const { addresses, best, data, isPending, error } = useLanUrls();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="เชื่อมต่อมือถือ"
        description="ใช้มือถือเช็กสต็อก ถ่ายรูปสินค้า และดูงานซ่อม ผ่าน WiFi ของร้าน (ไม่ต้องใช้อินเทอร์เน็ต)"
      />
      {isPending && <p className="text-muted-foreground">กำลังค้นหาที่อยู่เครื่อง…</p>}
      {error && <p className="text-destructive">{errorMessage(error)}</p>}
      {data && !best && (
        <p>ไม่พบการเชื่อมต่อเครือข่าย กรุณาตรวจสอบว่าเครื่องนี้ต่อ WiFi หรือสาย LAN อยู่</p>
      )}

      {best && (
        <Card className="mb-4">
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <QrCode text={urlFor(best)} size={220} className="rounded-lg border" />
            <div className="flex flex-col gap-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>ให้มือถือต่อ WiFi เดียวกับเครื่องนี้</li>
                <li>เปิดกล้องมือถือ แล้วสแกน QR</li>
                <li>หรือพิมพ์ที่อยู่นี้ในเบราว์เซอร์ของมือถือ</li>
              </ol>
              <p className="font-mono text-2xl font-semibold break-all">{urlFor(best)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {addresses.length > 1 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">ที่อยู่อื่นของเครื่องนี้</CardTitle>
            <CardDescription>ถ้าสแกนแล้วเปิดไม่ได้ ลองที่อยู่อื่นในรายการนี้</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {addresses.map((address) => (
                <li
                  key={`${address.interfaceName}-${address.address}`}
                  className="flex flex-wrap gap-2"
                >
                  <span className="font-mono">{urlFor(address)}</span>
                  <span className="text-muted-foreground">({address.interfaceName})</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="size-4" />
            มือถือเปิดไม่ได้?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>ตรวจสอบว่ามือถือต่อ WiFi ของร้าน ไม่ได้ใช้เน็ตมือถือ (4G/5G)</li>
            <li>
              Windows อาจบล็อกการเชื่อมต่อ: ตอนเปิดโปรแกรมครั้งแรกถ้ามีหน้าต่าง Windows Firewall
              ให้กด “อนุญาต” (Allow) สำหรับเครือข่ายส่วนตัว (Private)
            </li>
            <li>
              ที่อยู่ของเครื่องอาจเปลี่ยนเมื่อรีสตาร์ตเราเตอร์ แนะนำให้ตั้ง IP คงที่ (DHCP
              reservation) ให้เครื่องนี้ในเราเตอร์
            </li>
            <li>ถ้าร้านมี WiFi สำหรับลูกค้า ควรแยกเป็นอีกเครือข่าย (Guest) เพื่อความปลอดภัย</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
