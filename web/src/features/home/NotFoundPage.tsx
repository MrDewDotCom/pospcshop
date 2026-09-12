import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('ไม่พบหน้าที่ต้องการ');
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <p>ไม่พบหน้าที่ต้องการ</p>
      <Button asChild variant="outline">
        <Link to="/">กลับหน้าแรก</Link>
      </Button>
    </div>
  );
}
