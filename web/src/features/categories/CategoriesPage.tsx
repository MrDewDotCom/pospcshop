import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_LABELS,
  createCategoryInputSchema,
  specFieldsFor,
  type Category,
  type CategoryKind,
  type CreateCategoryInput,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useReorderCategories,
  useUpdateCategory,
} from './queries';

function SpecFieldPreview({ kind }: { kind: CategoryKind }) {
  const fields = specFieldsFor(kind);
  if (fields.length === 0) {
    return (
      <FieldDescription>ชนิดนี้ไม่มีช่องสเปกเฉพาะ ใช้ช่องรายละเอียดสินค้าแทน</FieldDescription>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {fields.map((field) => (
        <Badge key={field.key} variant="secondary" className="font-normal">
          {field.label}
        </Badge>
      ))}
    </div>
  );
}

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const mutation = category ? update : create;
  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategoryInputSchema),
    defaultValues: { name: category?.name ?? '', kind: category?.kind ?? 'other' },
  });

  const onSubmit = (values: CreateCategoryInput) => {
    const done = { onSuccess: () => (toast.success('บันทึกหมวดหมู่แล้ว'), onClose()) };
    if (category) update.mutate({ id: category.id, ...values }, done);
    else create.mutate(values, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle>
          <DialogDescription>
            ชนิดของหมวดหมู่กำหนดว่าฟอร์มสเปกของสินค้าจะมีช่องอะไรบ้าง
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={mutation.error} />
            <TextField
              label="ชื่อหมวดหมู่"
              required
              registration={form.register('name')}
              error={form.formState.errors.name?.message}
            />
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="kind">ชนิด (ใช้ฟอร์มสเปกแบบ)</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={category?.isSystem}
                  >
                    <SelectTrigger id="kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {CATEGORY_KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {category?.isSystem && (
                    <FieldDescription>หมวดหมู่หลักของระบบเปลี่ยนชนิดไม่ได้</FieldDescription>
                  )}
                  <SpecFieldPreview kind={field.value} />
                </Field>
              )}
            />
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

export function CategoriesPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: categories, isPending, error } = useCategories(showArchived);
  const archive = useArchiveCategory();
  const reorder = useReorderCategories();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const move = (index: number, delta: -1 | 1) => {
    if (!categories) return;
    const ids = categories.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, { onError: (err) => toast.error(errorMessage(err)) });
  };

  const toggleArchived = (category: Category) =>
    archive.mutate(
      { id: category.id, archived: !category.archivedAt },
      {
        onSuccess: () =>
          toast.success(category.archivedAt ? 'แสดงหมวดหมู่แล้ว' : 'ซ่อนหมวดหมู่แล้ว'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="หมวดหมู่สินค้า"
        description="หมวดหมู่หลักของระบบมีฟอร์มสเปกให้แล้ว เพิ่มหมวดหมู่ของร้านเองได้"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            เพิ่มหมวดหมู่
          </Button>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <Checkbox
          id="showArchived"
          checked={showArchived}
          onCheckedChange={(v) => setShowArchived(v === true)}
        />
        <Label htmlFor="showArchived">แสดงหมวดหมู่ที่ซ่อนไว้</Label>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ลำดับ</TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead>ชนิด</TableHead>
              <TableHead className="text-right">สินค้า</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {categories?.map((category, index) => (
              <TableRow
                key={category.id}
                className={category.archivedAt ? 'text-muted-foreground' : undefined}
              >
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
                      disabled={index === categories.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  {category.name}
                  {category.isSystem && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      หลัก
                    </Badge>
                  )}
                  {category.archivedAt && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      ซ่อนอยู่
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {CATEGORY_KIND_LABELS[category.kind]}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({specFieldsFor(category.kind).length} ช่องสเปก)
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{category.productCount}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="แก้ไข"
                      onClick={() => setEditing(category)}
                    >
                      <Pencil />
                    </Button>
                    {!category.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={category.archivedAt ? 'แสดง' : 'ซ่อน'}
                        onClick={() => toggleArchived(category)}
                        disabled={archive.isPending}
                      >
                        {category.archivedAt ? <Eye /> : <EyeOff />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
