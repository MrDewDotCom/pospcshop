import { useEffect, useState } from 'react';
import { THAI_RENDER_TEST } from '@pcshop/shared';
import { Button } from '@/components/ui/button';

interface Health {
  ok: boolean;
  name: string;
  version: string;
}

// Temporary scaffold page: proves web ↔ server ↔ shared wiring, Tailwind, shadcn, and the Thai font.
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    fetch('/api/health')
      .then((res) => (res.ok ? (res.json() as Promise<Health>) : Promise.reject(new Error())))
      .then((data) => {
        setHealth(data);
        setError(false);
      })
      .catch(() => setError(true));
  };

  useEffect(load, []);

  const check = () => {
    setHealth(null);
    setError(false);
    load();
  };

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">ระบบจัดการร้านคอมพิวเตอร์</h1>
      <p className="text-lg">{THAI_RENDER_TEST}</p>
      <p className="text-muted-foreground">
        สถานะเซิร์ฟเวอร์:{' '}
        {error ? (
          <span className="text-destructive">เชื่อมต่อไม่ได้</span>
        ) : health ? (
          <span className="text-green-700">
            ปกติ ({health.name} v{health.version})
          </span>
        ) : (
          'กำลังตรวจสอบ…'
        )}
      </p>
      <div>
        <Button onClick={check}>ตรวจสอบอีกครั้ง</Button>
      </div>
    </main>
  );
}
