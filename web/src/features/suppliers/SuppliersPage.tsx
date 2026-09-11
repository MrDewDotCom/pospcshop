import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Pencil, Plus, Search } from 'lucide-react';
import { supplierInputSchema, type Supplier, type SupplierInput } from '@pcshop/shared';
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
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { Pagination } from '@/components/Pagination';
import { TextAreaField, TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/features/auth/queries';
import { useArchiveSupplier, useCreateSupplier, useSuppliers, useUpdateSupplier } from './queries';

const PAGE_SIZE = 25;

/** Create or edit a supplier. `onSaved` receives the saved supplier (used by quick-add pickers). */
export function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved?: (supplier: Supplier) => void;
}) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const mutation = supplier ? update : create;
  const form = useForm<SupplierInput>({
    resolver: zodResolver(supplierInputSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      contactName: supplier?.contactName ?? '',
      phone: supplier?.phone ?? '',
      lineId: supplier?.lineId ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
    },
  });
  const errors = form.formState.errors;

  const onSubmit = (values: SupplierInput) => {
    const done = {
      onSuccess: (saved: Supplier) => {
        toast.success('บันทึกผู้จำหน่ายแล้ว');
        onSaved?.(saved);
        onClose();
      },
    };
    if (supplier) update.mutate({ id: supplier.id, ...values }, done);
    else create.mutate(values, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'}</DialogTitle>
          <DialogDescription>ร้านหรือบริษัทที่ร้านสั่งสินค้าเข้ามาขาย</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            // The dialog may sit inside another form (quick add on the receiving page).
            event.stopPropagation();
            void form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <FormAlert error={mutation.error} />
            <TextField
              label="ชื่อผู้จำหน่าย"
              required
              registration={form.register('name')}
              error={errors.name?.message}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="ผู้ติดต่อ"
                registration={form.register('contactName')}
                error={errors.contactName?.message}
              />
              <TextField
                label="เบอร์โทร"
                type="tel"
                registration={form.register('phone')}
                error={errors.phone?.message}
              />
            </div>
            <TextField
              label="LINE ID"
              registration={form.register('lineId')}
              error={errors.lineId?.message}
            />
            <TextAreaField
              label="ที่อยู่"
              rows={2}
              registration={form.register('address')}
              error={errors.address?.message}
            />
            <TextAreaField
              label="หมายเหตุ"
              rows={2}
              registration={form.register('notes')}
              error={errors.notes?.message}
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

export function SuppliersPage() {
  const user = useCurrentUser();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const { data, isPending, error } = useSuppliers({
    q: q.trim() || undefined,
    includeArchived: showArchived ? 'true' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const archive = useArchiveSupplier();
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const toggleArchived = (supplier: Supplier) =>
    archive.mutate(
      { id: supplier.id, archived: !supplier.archivedAt },
      {
        onSuccess: () =>
          toast.success(supplier.archivedAt ? 'แสดงผู้จำหน่ายแล้ว' : 'ซ่อนผู้จำหน่ายแล้ว'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="ผู้จำหน่าย"
        description="ร้านหรือบริษัทที่ส่งสินค้าให้ร้าน เลือกได้ตอนรับสินค้าเข้า"
        actions={
          user.can('supplier.edit') && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              เพิ่มผู้จำหน่าย
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่อ ผู้ติดต่อ หรือเบอร์โทร"
            aria-label="ค้นหาผู้จำหน่าย"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="showArchived"
            checked={showArchived}
            onCheckedChange={(v) => {
              setShowArchived(v === true);
              setPage(1);
            }}
          />
          <Label htmlFor="showArchived">แสดงที่ซ่อนไว้</Label>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>ผู้ติดต่อ</TableHead>
              <TableHead>เบอร์โทร</TableHead>
              <TableHead>LINE</TableHead>
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
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {q ? 'ไม่พบผู้จำหน่ายที่ค้นหา' : 'ยังไม่มีผู้จำหน่าย'}
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((supplier) => (
              <TableRow
                key={supplier.id}
                className={supplier.archivedAt ? 'text-muted-foreground' : undefined}
              >
                <TableCell className="font-medium">
                  {supplier.name}
                  {supplier.archivedAt && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      ซ่อนอยู่
                    </Badge>
                  )}
                  {supplier.notes && (
                    <div className="max-w-72 truncate text-xs font-normal text-muted-foreground">
                      {supplier.notes}
                    </div>
                  )}
                </TableCell>
                <TableCell>{supplier.contactName || '–'}</TableCell>
                <TableCell className="whitespace-nowrap">{supplier.phone || '–'}</TableCell>
                <TableCell>{supplier.lineId || '–'}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {user.can('supplier.edit') && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="แก้ไข"
                        onClick={() => setEditing(supplier)}
                      >
                        <Pencil />
                      </Button>
                    )}
                    {user.can('supplier.archive') && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={supplier.archivedAt ? 'แสดง' : 'ซ่อน'}
                        onClick={() => toggleArchived(supplier)}
                        disabled={archive.isPending}
                      >
                        {supplier.archivedAt ? <Eye /> : <EyeOff />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <div className="mt-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </div>
      )}
      {editing && (
        <SupplierDialog
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
