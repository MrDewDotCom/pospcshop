import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { FileDown, ImageDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Preview of a customer document with download buttons. Downloading is the primary way to share it
 * (the Clipboard and Share APIs don't work over the shop LAN's plain http): save the PNG, then send it
 * on LINE or Messenger.
 */
export function DocumentDialog({
  title,
  description,
  filename,
  onClose,
  render,
}: {
  title: string;
  description?: string;
  /** Without extension, e.g. the document number. */
  filename: string;
  onClose: () => void;
  render: (ref: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);

  const download = async (kind: 'png' | 'pdf') => {
    if (!ref.current) return;
    setBusy(kind);
    try {
      // Loaded on first use: html-to-image and jsPDF are most of the app's weight.
      const { downloadDocumentPdf, downloadDocumentPng } = await import('@/lib/exportImage');
      if (kind === 'png') await downloadDocumentPng(ref.current, `${filename}.png`);
      else await downloadDocumentPdf(ref.current, `${filename}.pdf`);
    } catch {
      toast.error('สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95svh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="overflow-auto rounded-md border bg-muted/50 p-3">
          <div className="mx-auto w-fit shadow-sm">{render(ref)}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => void download('pdf')} disabled={busy !== null}>
            {busy === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />}
            ดาวน์โหลด PDF (A4)
          </Button>
          <Button onClick={() => void download('png')} disabled={busy !== null}>
            {busy === 'png' ? <Loader2 className="animate-spin" /> : <ImageDown />}
            ดาวน์โหลดรูป (ส่ง LINE)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
