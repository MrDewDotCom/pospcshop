import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ProductImage } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImagePickerButtons } from '@/components/ImagePickerButtons';
import { errorMessage } from '@/lib/api';
import { uploadImage } from '@/features/files/useImageUpload';

export const MAX_PRODUCT_IMAGES = 12;

/** Product photos: upload (resized in the browser), reorder, remove. The first image is the cover. */
export function ProductImagesEditor({
  value,
  onChange,
}: {
  value: ProductImage[];
  onChange: (next: ProductImage[]) => void;
}) {
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const room = MAX_PRODUCT_IMAGES - value.length;

  const onFiles = async (picked: File[]) => {
    const files = picked.slice(0, room);
    if (picked.length > room) toast.warning(`ใส่รูปได้สูงสุด ${MAX_PRODUCT_IMAGES} รูป`);
    if (files.length === 0) return;
    const added: ProductImage[] = [];
    setUploading({ done: 0, total: files.length });
    try {
      for (const file of files) {
        const uploaded = await uploadImage(file);
        added.push({ fileId: uploaded.id, url: uploaded.url, thumbUrl: uploaded.thumbUrl });
        setUploading({ done: added.length, total: files.length });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : errorMessage(error));
    } finally {
      setUploading(null);
      if (added.length)
        onChange([...value, ...added.filter((a) => !value.some((v) => v.fileId === a.fileId))]);
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...value];
    const target = index + delta;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {value.map((image, index) => (
            <div
              key={image.fileId}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              <img src={image.thumbUrl} alt="" className="size-full object-cover" />
              {index === 0 && <Badge className="absolute top-1 left-1">รูปหลัก</Badge>}
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                className="absolute top-1 right-1"
                aria-label="ลบรูป"
                disabled={!!uploading}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
              <div className="absolute inset-x-1 bottom-1 flex justify-between">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label="เลื่อนไปทางซ้าย"
                  disabled={index === 0 || !!uploading}
                  onClick={() => move(index, -1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label="เลื่อนไปทางขวา"
                  disabled={index === value.length - 1 || !!uploading}
                  onClick={() => move(index, 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ImagePickerButtons
          multiple
          onFiles={(files) => void onFiles(files)}
          disabled={!!uploading || room <= 0}
          chooseLabel="เพิ่มรูป"
        />
        <span className="text-xs text-muted-foreground">
          {uploading
            ? `กำลังอัปโหลด ${uploading.done}/${uploading.total}…`
            : `${value.length}/${MAX_PRODUCT_IMAGES} รูป · รูปแรกเป็นรูปหลัก`}
        </span>
      </div>
    </div>
  );
}
