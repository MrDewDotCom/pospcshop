import { LoaderCircle } from 'lucide-react';

export function FullPageSpinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
