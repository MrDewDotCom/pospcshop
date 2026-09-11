import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, ClipboardCheck, PackagePlus, Package, Truck } from 'lucide-react';
import { ROLE_LABELS, formatThaiDate } from '@pcshop/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/queries';
import { useUnverifiedReceiptCount } from '@/features/receiving/queries';

const SHORTCUTS = [
  { to: '/products', label: 'สินค้า', description: 'ค้นหา เพิ่ม และแก้ไขสินค้า', icon: Package },
  {
    to: '/receiving/new',
    label: 'รับสินค้าเข้า',
    description: 'สแกนสินค้าที่ได้รับจากผู้จำหน่ายเข้าสต็อก',
    icon: PackagePlus,
  },
  {
    to: '/suppliers',
    label: 'ผู้จำหน่าย',
    description: 'รายชื่อร้าน/บริษัทที่ส่งของ',
    icon: Truck,
  },
];

// Phase 1 home: owner to-dos and shortcuts. Phase 2 replaces it with the dashboard.
export function HomePage() {
  const user = useCurrentUser();
  const [today] = useState(() => formatThaiDate(Date.now(), { month: 'long' }));
  const canReview = user.can('goodsReceipt.verifyCost');
  const { data: unverified } = useUnverifiedReceiptCount(canReview);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">สวัสดี, {user.name}</h1>
        <p className="text-muted-foreground">
          {ROLE_LABELS[user.role]} · {today}
        </p>
      </div>

      {canReview && !!unverified && (
        <Link
          to="/receiving?costStatus=unverified"
          className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100"
        >
          <ClipboardCheck className="size-5 shrink-0" />
          <span className="flex-1">
            มีใบรับสินค้ารอตรวจสอบต้นทุน{' '}
            <span className="font-semibold tabular-nums">{unverified}</span> ใบ
          </span>
          <ChevronRight className="size-4" />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {SHORTCUTS.map((item) => (
          <Link key={item.to} to={item.to} className="group">
            <Card className="h-full transition-colors group-hover:bg-accent">
              <CardHeader>
                <item.icon className="mb-1 size-5 text-muted-foreground" />
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
