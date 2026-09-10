import { toast } from 'sonner';
import { Store, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImagePickerButtons } from '@/components/ImagePickerButtons';
import { errorMessage } from '@/lib/api';
import { useImageUpload } from '@/features/files/useImageUpload';
import { useUpdateSettings } from './queries';

/** Uploads and saves the shop logo immediately (separately from the settings form). */
export function LogoUploader({ logoUrl }: { logoUrl: string | null }) {
  // Logos keep PNG transparency and don't need to be large.
  const upload = useImageUpload({ keepPng: true, maxSide: 800 });
  const update = useUpdateSettings();
  const busy = upload.isPending || update.isPending;

  const onFiles = ([file]: File[]) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (uploaded) =>
        update.mutate(
          { logoFileId: uploaded.id },
          {
            onSuccess: () => toast.success('บันทึกโลโก้เรียบร้อยแล้ว'),
            onError: (error) => toast.error(errorMessage(error)),
          },
        ),
      onError: (error) => toast.error(error instanceof Error ? error.message : errorMessage(error)),
    });
  };

  const remove = () =>
    update.mutate({ logoFileId: null }, { onSuccess: () => toast.success('ลบโลโก้แล้ว') });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {logoUrl ? (
          <img src={logoUrl} alt="โลโก้ร้าน" className="size-full object-contain" />
        ) : (
          <Store className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <ImagePickerButtons
          onFiles={onFiles}
          disabled={busy}
          chooseLabel={logoUrl ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้'}
        />
        {logoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={remove}
            className="self-start"
          >
            <Trash2 />
            ลบโลโก้
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {busy ? 'กำลังอัปโหลด…' : 'แนะนำไฟล์ PNG พื้นหลังโปร่งใส'}
        </p>
      </div>
    </div>
  );
}
