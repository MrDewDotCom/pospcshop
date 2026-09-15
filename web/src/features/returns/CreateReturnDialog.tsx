import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { cn } from 'cn';
import { REFUND_METHOD_LABELS, REFUND_METHODS, type RefundMethod, type Sale } from '@pcshop/shared';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/components/FormAlert';
import { formatMoney } from '@/lib/format';
import { useCreateReturn } from './queries';

const QUICK_REASONS = [
  'สินค้าเสีย/ใช้งานไม่ได้',
  'ไม่ตรงสเปก/ใช้ร่วมกันไม่ได้',
  'ลูกค้าเปลี่ยนใจ',
  'ส่งเคลมตามประกัน',
];

interface Selection {
  /** Non-serial lines. */
  qty: number;
  /** Serial lines: exactly which units came back. */
  serialIds: number[];
}

/**
 * Record a return against this sale (staff or owner). The units go into quarantine; sellable stock
 * doesn't change until someone decides to restock them (Q8/P16). The refund is computed from what the
 * customer paid; only the owner can change it afterwards (P21).
 */
export function CreateReturnDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateReturn();
  const lines = sale.lines.filter(
    (line) => line.parentItemId === null && line.trackStock && line.qty > line.returnedQty,
  );
  const [selected, setSelected] = useState<Record<number, Selection>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>(
    sale.payment?.method === 'transfer' ? 'transfer' : 'cash',
  );
  const [touched, setTouched] = useState(false);

  const qtyOf = (lineId: number) => {
    const s = selected[lineId];
    return s ? s.qty + s.serialIds.length : 0;
  };
  const chosen = lines.filter((line) => qtyOf(line.id) > 0);
  const units = chosen.reduce((sum, line) => sum + qtyOf(line.id), 0);
  const refund =
    refundMethod === 'none'
      ? 0
      : chosen.reduce((sum, line) => sum + line.unitPriceSatang * qtyOf(line.id), 0);
  const missingReason = reason.trim() === '';

  const setQty = (lineId: number, qty: number) =>
    setSelected((s) => ({ ...s, [lineId]: { qty, serialIds: [] } }));
  const toggleSerial = (lineId: number, serialId: number) =>
    setSelected((s) => {
      const current = s[lineId]?.serialIds ?? [];
      const serialIds = current.includes(serialId)
        ? current.filter((id) => id !== serialId)
        : [...current, serialId];
      return { ...s, [lineId]: { qty: 0, serialIds } };
    });

  const submit = () => {
    setTouched(true);
    if (missingReason || units === 0) return;
    create.mutate(
      {
        saleId: sale.id,
        reason,
        refundMethod,
        lines: chosen.map((line) => ({
          saleItemId: line.id,
          qty: qtyOf(line.id),
          serialItemIds: selected[line.id]?.serialIds ?? [],
        })),
      },
      {
        onSuccess: (ret) => {
          toast.success(`บันทึกรับคืน ${ret.docNo} แล้ว`);
          onClose();
          navigate(`/returns/${ret.id}`);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>รับคืนสินค้าจากบิล {sale.docNo}</DialogTitle>
          <DialogDescription>
            เลือกสินค้าและจำนวนที่ลูกค้านำมาคืน สินค้าที่รับคืนจะรอตรวจสอบก่อน
            ยังไม่นำกลับเข้าสต็อกขาย
          </DialogDescription>
        </DialogHeader>
        <FormAlert error={create.error} />

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">บิลนี้ไม่มีสินค้าที่คืนได้แล้ว</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {lines.map((line) => {
              const left = line.qty - line.returnedQty;
              const qty = qtyOf(line.id);
              return (
                <li key={line.id} className={cn('px-3 py-2.5', qty > 0 && 'bg-muted/50')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{line.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatMoney(line.unitPriceSatang)}/ชิ้น · ซื้อ {line.qty} คืนได้อีก {left}
                      </div>
                    </div>
                    {!line.serialRequired && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="ลดจำนวน"
                          onClick={() => setQty(line.id, Math.max(0, qty - 1))}
                          disabled={qty === 0}
                        >
                          <Minus />
                        </Button>
                        <span className="w-10 text-center tabular-nums">{qty}</span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="เพิ่มจำนวน"
                          onClick={() => setQty(line.id, Math.min(left, qty + 1))}
                          disabled={qty >= left}
                        >
                          <Plus />
                        </Button>
                      </div>
                    )}
                  </div>
                  {line.serialRequired && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {line.serials
                        .filter((s) => !s.returned)
                        .map((serial) => (
                          <label
                            key={serial.id}
                            className="flex cursor-pointer items-center gap-1.5 rounded border bg-background px-2 py-1"
                          >
                            <Checkbox
                              checked={selected[line.id]?.serialIds.includes(serial.id) ?? false}
                              onCheckedChange={() => toggleSerial(line.id, serial.id)}
                            />
                            <span className="font-mono text-xs">{serial.serialNo}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {touched && units === 0 && (
          <p className="text-sm text-destructive">กรุณาเลือกสินค้าที่คืนอย่างน้อย 1 ชิ้น</p>
        )}

        <Field data-invalid={touched && missingReason}>
          <FieldLabel htmlFor="returnReason">
            เหตุผลที่คืน<span className="text-destructive">*</span>
          </FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((text) => (
              <Button
                key={text}
                type="button"
                variant={reason === text ? 'default' : 'outline'}
                size="xs"
                onClick={() => setReason(text)}
              >
                {text}
              </Button>
            ))}
          </div>
          <Textarea
            id="returnReason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="อาการเสีย หรือรายละเอียดเพิ่มเติม"
            maxLength={500}
            aria-invalid={touched && missingReason}
          />
          {touched && missingReason && <FieldError>กรุณาระบุเหตุผลที่คืนสินค้า</FieldError>}
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium">การคืนเงิน</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="การคืนเงิน">
            {REFUND_METHODS.map((method) => (
              <Button
                key={method}
                type="button"
                role="radio"
                aria-checked={refundMethod === method}
                variant={refundMethod === method ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRefundMethod(method)}
              >
                {REFUND_METHOD_LABELS[method]}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {refundMethod === 'none' ? 'ไม่คืนเงินให้ลูกค้า' : 'คืนเงินตามราคาที่ลูกค้าจ่าย'}
            </span>
            <span className="text-xl font-semibold tabular-nums">{formatMoney(refund)}</span>
          </div>
          {refundMethod !== 'none' && (
            <p className="text-xs text-muted-foreground">
              ถ้าต้องหักค่าใช้จ่าย (เช่น กล่องหาย) เจ้าของร้านแก้ยอดคืนเงินได้ในหน้าใบคืนสินค้า
            </p>
          )}
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          สินค้า {units.toLocaleString('th-TH')} ชิ้นจะอยู่ในสถานะ{' '}
          <Badge variant="outline" className="border-amber-300 bg-white text-amber-900">
            สินค้าคืน – รอตรวจสอบ
          </Badge>{' '}
          สต็อกที่ขายได้ยังไม่เปลี่ยน จนกว่าจะเลือกคืนเข้าสต็อก ส่งเคลม หรือตัดจำหน่าย
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={create.isPending || lines.length === 0}>
            {create.isPending ? 'กำลังบันทึก…' : 'ยืนยันรับคืนสินค้า'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
