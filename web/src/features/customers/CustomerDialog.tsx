import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import {
  customerInputSchema,
  type Customer,
  type CustomerInput,
  type CustomerListItem,
} from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { FormAlert } from '@/components/FormAlert';
import { TextAreaField, TextField } from '@/components/TextField';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useCreateCustomer, useCustomerPhoneMatches, useUpdateCustomer } from './queries';

/** "This phone number already belongs to …" — families and shops share numbers, so it never blocks. */
function PhoneMatchWarning({
  phone,
  excludeId,
  onPick,
}: {
  phone: string;
  excludeId?: number;
  onPick?: (id: number) => void;
}) {
  const debounced = useDebouncedValue(phone, 400);
  const { data: matches } = useCustomerPhoneMatches(debounced, excludeId);
  if (!matches?.length) return null;
  return (
    <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>
        เบอร์นี้มีลูกค้าอยู่แล้ว:{' '}
        {matches.map((m, index) => (
          <span key={m.id}>
            {index > 0 && ', '}
            {onPick ? (
              <button type="button" className="font-medium underline" onClick={() => onPick(m.id)}>
                {m.name}
              </button>
            ) : (
              <span className="font-medium">{m.name}</span>
            )}
            {m.archivedAt && ' (ซ่อนอยู่)'}
          </span>
        ))}
        <div className="text-xs">ถ้าเป็นคนเดียวกัน ใช้ข้อมูลเดิมได้ ถ้าไม่ใช่ บันทึกต่อได้เลย</div>
      </div>
    </div>
  );
}

/**
 * Create or edit a customer. `onSaved` receives the saved customer (the POS quick add uses it), and
 * `onPickExisting` lets the POS use an existing customer found by the duplicate-phone warning instead.
 */
export function CustomerDialog({
  customer,
  initialName = '',
  onClose,
  onSaved,
  onPickExisting,
}: {
  customer: Customer | null;
  initialName?: string;
  onClose: () => void;
  onSaved?: (customer: CustomerListItem) => void;
  onPickExisting?: (id: number) => void;
}) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const mutation = customer ? update : create;
  const form = useForm<CustomerInput>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      name: customer?.name ?? initialName,
      phone: customer?.phone ?? '',
      lineId: customer?.lineId ?? '',
      address: customer?.address ?? '',
      notes: customer?.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const phone = useWatch({ control: form.control, name: 'phone' }) ?? '';

  const onSubmit = (values: CustomerInput) => {
    const done = {
      onSuccess: (saved: CustomerListItem) => {
        toast.success('บันทึกข้อมูลลูกค้าแล้ว');
        onSaved?.(saved);
        onClose();
      },
    };
    if (customer) update.mutate({ id: customer.id, ...values }, done);
    else create.mutate(values, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้า'}</DialogTitle>
          <DialogDescription>ใส่แค่ชื่อก็พอ ข้อมูลอื่นเพิ่มทีหลังได้</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            // The dialog may open from inside another form (the POS).
            event.stopPropagation();
            void form.handleSubmit(onSubmit)(event);
          }}
          noValidate
        >
          <FieldGroup>
            <FormAlert error={mutation.error} />
            <TextField
              label="ชื่อลูกค้า"
              required
              autoFocus
              registration={form.register('name')}
              error={errors.name?.message}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="เบอร์โทร"
                type="tel"
                registration={form.register('phone')}
                error={errors.phone?.message}
              />
              <TextField
                label="LINE ID"
                registration={form.register('lineId')}
                error={errors.lineId?.message}
              />
            </div>
            <PhoneMatchWarning phone={phone} excludeId={customer?.id} onPick={onPickExisting} />
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
