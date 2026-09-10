import { Download, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadText } from '@/lib/download';

/** Displays the owner's one-time recovery code with a download button. */
export function RecoveryCodeCard({ code, shopName }: { code: string; shopName: string }) {
  const download = () =>
    downloadText(
      'รหัสกู้คืน-PC-Shop-Manager.txt',
      [
        `รหัสกู้คืนรหัสผ่านเจ้าของร้าน (${shopName})`,
        '',
        code,
        '',
        'ใช้รหัสนี้ที่หน้า "เจ้าของร้านลืมรหัสผ่าน?" เพื่อตั้งรหัสผ่านใหม่',
        'รหัสนี้ใช้ได้ครั้งเดียว หลังใช้แล้วระบบจะให้รหัสใหม่',
        'เก็บไฟล์นี้ไว้ในที่ปลอดภัย และอย่าให้พนักงานเห็น',
      ].join('\r\n'),
    );

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-5 text-center">
      <KeyRound className="size-8 text-amber-600" />
      <p className="font-mono text-xl font-semibold tracking-wider break-all select-all sm:text-2xl">
        {code}
      </p>
      <Button type="button" variant="outline" onClick={download}>
        <Download />
        ดาวน์โหลดเก็บไว้เป็นไฟล์
      </Button>
    </div>
  );
}
