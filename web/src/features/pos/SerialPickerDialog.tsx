import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from 'cn';
import type { ProductListItem } from '@pcshop/shared';
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
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useProductSerials } from '@/features/stock/queries';
import type { CartSerial } from './usePosCart';

/** Choose which in-stock units of a serial product go on the bill. */
export function SerialPickerDialog({
  product,
  selected,
  onClose,
  onDone,
}: {
  product: ProductListItem;
  selected: CartSerial[];
  onClose: () => void;
  onDone: (serials: CartSerial[]) => void;
}) {
  const { data: units, isPending, error } = useProductSerials(product.id, 'in_stock');
  const [chosen, setChosen] = useState(() => new Map(selected.map((s) => [s.id, s])));
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const q = filter.trim().toUpperCase();
    return (units ?? []).filter((u) => !q || u.serialNo.toUpperCase().includes(q));
  }, [units, filter]);

  const toggle = (unit: CartSerial) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(unit.id)) next.delete(unit.id);
      else next.set(unit.id, unit);
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>เลือกซีเรียล</DialogTitle>
          <DialogDescription>
            {product.name} · พร้อมขาย {units?.length.toLocaleString('th-TH') ?? '…'} ชิ้น
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              // A scanner in the filter box picks the unit it scanned.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const exact = (units ?? []).find(
                (u) => u.serialNo.toUpperCase() === filter.trim().toUpperCase(),
              );
              if (exact) {
                if (!chosen.has(exact.id)) toggle(exact);
                setFilter('');
              }
            }}
            placeholder="ค้นหาหรือสแกนซีเรียล"
            aria-label="ค้นหาซีเรียล"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {isPending && <p className="p-3 text-sm text-muted-foreground">กำลังโหลด…</p>}
          {error && <p className="p-3 text-sm text-destructive">{errorMessage(error)}</p>}
          {units?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">ไม่มีหน่วยที่พร้อมขาย</p>
          )}
          {visible.map((unit) => (
            <label
              key={unit.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/60',
                chosen.has(unit.id) && 'bg-muted',
              )}
            >
              <Checkbox
                checked={chosen.has(unit.id)}
                onCheckedChange={() => toggle({ id: unit.id, serialNo: unit.serialNo })}
              />
              <span className="font-mono text-sm">{unit.serialNo}</span>
              {unit.wasReturned && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  เคยถูกคืน
                </Badge>
              )}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => onDone([...chosen.values()])} disabled={chosen.size === 0}>
            ใช้ {chosen.size.toLocaleString('th-TH')} ชิ้น
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
