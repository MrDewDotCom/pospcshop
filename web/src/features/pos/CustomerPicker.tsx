import { useState } from 'react';
import { Search, UserPlus, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useCurrentUser } from '@/features/auth/queries';
import { CustomerDialog } from '@/features/customers/CustomerDialog';
import { useCustomers } from '@/features/customers/queries';
import type { CustomerListItem } from '@pcshop/shared';
import type { CartCustomer } from './usePosCart';

const toCartCustomer = (c: Pick<CustomerListItem, 'id' | 'name' | 'phone'>): CartCustomer => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
});

function PickDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (customer: CartCustomer) => void;
}) {
  const user = useCurrentUser();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 200);
  const { data, isFetching } = useCustomers({ q: debounced || undefined, pageSize: 8 });
  const [adding, setAdding] = useState(false);

  // The duplicate-phone warning in the add form can point at an existing customer: use that one.
  const pickById = async (id: number) => {
    const customer = await api.get<CustomerListItem>(`/api/customers/${id}`);
    onPick(toCartCustomer(customer));
  };

  if (adding) {
    const looksLikePhone = /^[\d\s+-]+$/.test(q.trim());
    return (
      <CustomerDialog
        customer={null}
        initialName={looksLikePhone ? '' : q.trim()}
        onClose={() => setAdding(false)}
        onSaved={(saved) => onPick(toCartCustomer(saved))}
        onPickExisting={(id) => void pickById(id)}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เลือกลูกค้า</DialogTitle>
          <DialogDescription>ไม่เลือกก็ขายได้ (ลูกค้าทั่วไป)</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ชื่อ หรือเบอร์โทร"
            aria-label="ค้นหาลูกค้า"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {data?.items.length === 0 && !isFetching && (
            <p className="p-3 text-sm text-muted-foreground">ไม่พบลูกค้า</p>
          )}
          {data?.items.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onPick(toCartCustomer(customer))}
              className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{customer.name}</span>
                <span className="text-xs text-muted-foreground">{customer.phone || '–'}</span>
              </span>
              {customer.saleCount > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  ซื้อแล้ว {customer.saleCount.toLocaleString('th-TH')} บิล
                </span>
              )}
            </button>
          ))}
        </div>
        {user.can('customer.edit') && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserPlus />
            เพิ่มลูกค้าใหม่
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The customer on the bill: optional (Q14), walk-in by default. */
export function CustomerPicker({
  customer,
  onChange,
  onDialogClose,
}: {
  customer: CartCustomer | null;
  onChange: (customer: CartCustomer | null) => void;
  /** Called when the picker closes, so the POS can put focus back in the scan box. */
  onDialogClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onDialogClose();
  };

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
        <UserRound className="size-5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-w-0 flex-1 text-left"
          aria-label="เลือกลูกค้า"
        >
          {customer ? (
            <>
              <span className="block truncate text-sm font-medium">{customer.name}</span>
              <span className="block text-xs text-muted-foreground">{customer.phone || '–'}</span>
            </>
          ) : (
            <>
              <span className="block text-sm">ลูกค้าทั่วไป</span>
              <span className="block text-xs text-muted-foreground">
                กดเพื่อเลือกหรือเพิ่มลูกค้า
              </span>
            </>
          )}
        </button>
        {customer && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="ไม่ระบุลูกค้า"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
      {open && (
        <PickDialog
          onClose={close}
          onPick={(picked) => {
            onChange(picked);
            close();
          }}
        />
      )}
    </>
  );
}
