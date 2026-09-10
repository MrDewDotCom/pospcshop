import { useState } from 'react';
import { ROLE_LABELS, formatThaiDate } from '@pcshop/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/queries';

// Placeholder home page. Phase 1 adds shortcuts here; Phase 2 replaces it with the dashboard.
export function HomePage() {
  const user = useCurrentUser();
  const [today] = useState(() => formatThaiDate(Date.now(), { month: 'long' }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">สวัสดี, {user.name}</h1>
        <p className="text-muted-foreground">
          {ROLE_LABELS[user.role]} · {today}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ระบบพร้อมใช้งาน</CardTitle>
          <CardDescription>
            เมนูจัดการสินค้า รับสินค้าเข้า และสต็อก จะเพิ่มเข้ามาเร็ว ๆ นี้
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
