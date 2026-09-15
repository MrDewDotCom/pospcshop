import { useState } from 'react';
import { toast } from 'sonner';
import type { Sale, VoidInput } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/components/FormAlert';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useSaleMutation } from './queries';

const useVoidSale = () =>
  useSaleMutation(({ id, ...input }: VoidInput & { id: number }) =>
    api.post<Sale>(`/api/sales/${id}/void`, input),
  );

/** Owner only. Shows the stock that comes back before confirming (Q1). */
export function VoidSaleDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const voidSale = useVoidSale();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = reason.trim() === '';
  // Services and other untracked products have nothing to put back.
  const stockLines = sale.lines.filter((line) => line.trackStock);

  const submit = () => {
    setTouched(true);
    if (missing) return;
    voidSale.mutate(
      { id: sale.id, reason },
      { onSuccess: () => (toast.success(`ยกเลิกบิล ${sale.docNo} แล้ว`), onClose()) },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !voidSale.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยกเลิกบิล {sale.docNo}?</DialogTitle>
          <DialogDescription>
            ยอด {formatMoney(sale.totalSatang)} จะไม่นับเป็นยอดขาย การชำระเงินจะถูกยกเลิก
            ถ้ารับเงินไปแล้วต้องคืนเงินให้ลูกค้าเอง บิลจะยังอยู่ในระบบพร้อมสถานะ “ยกเลิกแล้ว”
            และยกเลิกกลับไม่ได้
          </DialogDescription>
        </DialogHeader>
        <FormAlert error={voidSale.error} />
        {stockLines.length > 0 && (
          <div>
            <div className="mb-1 text-sm font-medium">สินค้าที่จะคืนเข้าสต็อก</div>
            <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-md border text-sm">
              {stockLines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{line.name}</span>
                    {line.serials.length > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {line.serials.map((s) => s.serialNo).join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-emerald-700 tabular-nums">
                    +{line.qty.toLocaleString('th-TH')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Field data-invalid={touched && missing}>
          <FieldLabel htmlFor="voidReason">
            เหตุผลที่ยกเลิก<span className="text-destructive">*</span>
          </FieldLabel>
          <Textarea
            id="voidReason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น คิดเงินผิด, ลูกค้ายกเลิกก่อนรับของ"
            maxLength={500}
            aria-invalid={touched && missing}
          />
          {touched && missing && <FieldError>กรุณาระบุเหตุผลที่ยกเลิก</FieldError>}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={voidSale.isPending}>
            ไม่ยกเลิก
          </Button>
          <Button variant="destructive" onClick={submit} disabled={voidSale.isPending}>
            {voidSale.isPending ? 'กำลังยกเลิก…' : 'ยกเลิกบิลและคืนสต็อก'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
