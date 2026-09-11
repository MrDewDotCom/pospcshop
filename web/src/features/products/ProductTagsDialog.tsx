import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { Product } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormAlert } from '@/components/FormAlert';
import { CustomTagChip } from '@/components/ProductTags';
import { useTags } from '@/features/tags/queries';
import { useSetProductTags } from './queries';

/** Owner picks which custom tags a product carries. */
export function ProductTagsDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { data: tags, isPending } = useTags();
  const save = useSetProductTags();
  const [selected, setSelected] = useState(() => new Set(product.tags.map((t) => t.id)));

  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const onSave = () =>
    save.mutate(
      { id: product.id, tagIds: [...selected] },
      { onSuccess: () => (toast.success('บันทึกแท็กแล้ว'), onClose()) },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แท็กของสินค้า</DialogTitle>
          <DialogDescription className="break-words">{product.name}</DialogDescription>
        </DialogHeader>
        <FormAlert error={save.error} />
        {isPending && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
        {tags?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีแท็ก สร้างแท็กได้ที่{' '}
            <Link to="/settings/tags" className="text-primary underline" onClick={onClose}>
              ตั้งค่า › แท็กสินค้า
            </Link>
          </p>
        )}
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {tags?.map((tag) => (
            <li key={tag.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox
                  checked={selected.has(tag.id)}
                  onCheckedChange={(v) => toggle(tag.id, v === true)}
                />
                <CustomTagChip tag={tag} />
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={onSave} disabled={save.isPending || isPending}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
