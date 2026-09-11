import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import { cn } from 'cn';
import {
  TAG_COLORS,
  TAG_COLOR_LABELS,
  createTagInputSchema,
  type CreateTagInput,
  type Tag,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FormAlert } from '@/components/FormAlert';
import { PageHeader } from '@/components/PageHeader';
import { CustomTagChip, TAG_SWATCH_CLASSES } from '@/components/ProductTags';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useArchiveTag, useCreateTag, useReorderTags, useTags, useUpdateTag } from './queries';

function TagDialog({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const create = useCreateTag();
  const update = useUpdateTag();
  const mutation = tag ? update : create;
  const form = useForm<CreateTagInput>({
    resolver: zodResolver(createTagInputSchema),
    defaultValues: { name: tag?.name ?? '', color: tag?.color ?? 'blue' },
  });
  const [name, color] = useWatch({ control: form.control, name: ['name', 'color'] });

  const onSubmit = (values: CreateTagInput) => {
    const done = { onSuccess: () => (toast.success('บันทึกแท็กแล้ว'), onClose()) };
    if (tag) update.mutate({ id: tag.id, ...values }, done);
    else create.mutate(values, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tag ? 'แก้ไขแท็ก' : 'เพิ่มแท็ก'}</DialogTitle>
          <DialogDescription>
            แท็กจะแสดงบนสินค้าทุกที่ที่ลูกค้าและพนักงานเห็น เช่น รายการสินค้า และหน้าค้นหาสต็อก
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={mutation.error} />
            <TextField
              label="ชื่อแท็ก"
              required
              placeholder="เช่น Open box, กล่องไม่สวย"
              registration={form.register('name')}
              error={form.formState.errors.name?.message}
            />
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <Field>
                  <FieldLabel>สี</FieldLabel>
                  <div role="radiogroup" aria-label="สีของแท็ก" className="flex flex-wrap gap-2">
                    {TAG_COLORS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={field.value === option}
                        aria-label={TAG_COLOR_LABELS[option]}
                        title={TAG_COLOR_LABELS[option]}
                        onClick={() => field.onChange(option)}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background',
                          TAG_SWATCH_CLASSES[option],
                          field.value === option && 'ring-2 ring-foreground',
                        )}
                      >
                        {field.value === option && <Check className="size-4 text-white" />}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            />
            <Field>
              <FieldLabel>ตัวอย่าง</FieldLabel>
              <div>
                <CustomTagChip tag={{ id: 0, name: name.trim() || 'ชื่อแท็ก', color }} />
              </div>
              <FieldDescription>
                สภาพสินค้า ประกัน ส่วนลด และสถานะสต็อก ระบบติดแท็กให้อัตโนมัติ ไม่ต้องสร้างเอง
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TagsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: tags, isPending, error } = useTags(showArchived);
  const archive = useArchiveTag();
  const reorder = useReorderTags();
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);

  const move = (index: number, delta: -1 | 1) => {
    if (!tags) return;
    const ids = tags.map((t) => t.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, { onError: (err) => toast.error(errorMessage(err)) });
  };

  const toggleArchived = (tag: Tag) =>
    archive.mutate(
      { id: tag.id, archived: !tag.archivedAt },
      {
        onSuccess: () => toast.success(tag.archivedAt ? 'แสดงแท็กแล้ว' : 'ซ่อนแท็กแล้ว'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="แท็กสินค้า"
        description="แท็กของร้านเอง เช่น Open box, กล่องไม่สวย, สินค้าแนะนำ ติดให้สินค้าได้ที่หน้ารายละเอียดสินค้า"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            เพิ่มแท็ก
          </Button>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <Checkbox
          id="showArchived"
          checked={showArchived}
          onCheckedChange={(v) => setShowArchived(v === true)}
        />
        <Label htmlFor="showArchived">แสดงแท็กที่ซ่อนไว้</Label>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ลำดับ</TableHead>
              <TableHead>แท็ก</TableHead>
              <TableHead className="text-right">สินค้า</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {tags?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  ยังไม่มีแท็ก กด &quot;เพิ่มแท็ก&quot; เพื่อสร้างแท็กแรก
                </TableCell>
              </TableRow>
            )}
            {tags?.map((tag, index) => (
              <TableRow key={tag.id} className={tag.archivedAt ? 'opacity-60' : undefined}>
                <TableCell>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="เลื่อนขึ้น"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="เลื่อนลง"
                      disabled={index === tags.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <CustomTagChip tag={tag} />
                  {tag.archivedAt && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      ซ่อนอยู่
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{tag.productCount}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="แก้ไข"
                      onClick={() => setEditing(tag)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tag.archivedAt ? 'แสดง' : 'ซ่อน'}
                      title={
                        tag.archivedAt
                          ? 'แสดงแท็กอีกครั้ง'
                          : 'ซ่อนแท็ก (สินค้าที่ติดไว้จะกลับมาแสดงเมื่อเปิดแท็กอีกครั้ง)'
                      }
                      onClick={() => toggleArchived(tag)}
                      disabled={archive.isPending}
                    >
                      {tag.archivedAt ? <Eye /> : <EyeOff />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && (
        <TagDialog tag={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
