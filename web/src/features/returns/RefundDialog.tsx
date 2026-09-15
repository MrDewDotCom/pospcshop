import { useState } from 'react';
import { toast } from 'sonner';
import { parseBahtInput, satangToInput, type SaleReturn } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormAlert } from '@/components/FormAlert';
import { formatMoney } from '@/lib/format';
import { useUpdateRefund } from './queries';

/** Owner only (P21): change how much the customer gets back, up to what they paid. */
export function RefundDialog({ ret, onClose }: { ret: SaleReturn; onClose: () => void }) {
  const update = useUpdateRefund();
  const [text, setText] = useState(satangToInput(ret.refundSatang));
  const amount = parseBahtInput(text);
  const problem =
    amount === null
      ? 'กรุณากรอกจำนวนเงินให้ถูกต้อง'
      : amount > ret.maxRefundSatang
        ? `คืนได้ไม่เกิน ${formatMoney(ret.maxRefundSatang)}`
        : null;

  const submit = () => {
    if (problem || amount === null) return;
    update.mutate(
      { id: ret.id, refundSatang: amount },
      { onSuccess: () => (toast.success('แก้ยอดคืนเงินแล้ว'), onClose()) },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>แก้ยอดคืนเงิน {ret.docNo}</DialogTitle>
          <DialogDescription>
            ใช้เมื่อต้องหักค่าใช้จ่าย เช่น อุปกรณ์หรือกล่องไม่ครบ ระบบจะบันทึกประวัติการแก้ไขไว้
          </DialogDescription>
        </DialogHeader>
        <FormAlert error={update.error} />
        <Field data-invalid={!!problem}>
          <FieldLabel htmlFor="refundAmount">ยอดคืนเงิน</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
              ฿
            </span>
            <Input
              id="refundAmount"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className="pl-7 text-right text-lg tabular-nums"
              aria-invalid={!!problem}
            />
          </div>
          {problem ? (
            <FieldError>{problem}</FieldError>
          ) : (
            <FieldDescription>
              ลูกค้าจ่ายสำหรับสินค้าที่คืน {formatMoney(ret.maxRefundSatang)}
            </FieldDescription>
          )}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={!!problem || update.isPending}>
            {update.isPending ? 'กำลังบันทึก…' : 'บันทึกยอดคืนเงิน'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
