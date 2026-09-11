import { useState } from 'react';
import { toast } from 'sonner';
import { parseBahtInput, satangToInput, type GoodsReceipt } from '@pcshop/shared';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/components/FormAlert';
import { formatMoney } from '@/lib/format';
import { useVerifyReceiptCosts, useVoidReceipt } from './queries';

/**
 * Owner confirms or corrects each line's cost. Lines start with what staff typed (or the average that
 * was used when they left it blank).
 */
export function VerifyCostsDialog({
  receipt,
  onClose,
}: {
  receipt: GoodsReceipt;
  onClose: () => void;
}) {
  const verify = useVerifyReceiptCosts();
  const [costs, setCosts] = useState<Record<number, string>>(() =>
    Object.fromEntries(receipt.lines.map((l) => [l.id, satangToInput(l.unitCostSatang ?? 0)])),
  );
  const parsed = receipt.lines.map((line) => ({ line, satang: parseBahtInput(costs[line.id]!) }));
  const invalid = parsed.some((p) => p.satang === null);
  const total = parsed.reduce((sum, p) => sum + (p.satang ?? 0) * p.line.qty, 0);
  const changed = parsed.filter((p) => p.satang !== null && p.satang !== p.line.unitCostSatang);

  const submit = () =>
    verify.mutate(
      {
        id: receipt.id,
        lines: parsed.map((p) => ({ itemId: p.line.id, unitCostSatang: p.satang! })),
      },
      { onSuccess: () => (toast.success('ยืนยันต้นทุนแล้ว'), onClose()) },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && !verify.isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>ตรวจสอบต้นทุน {receipt.docNo}</DialogTitle>
          <DialogDescription>
            เทียบกับบิลของผู้จำหน่าย แล้วแก้ต้นทุนต่อชิ้นถ้าไม่ตรง ถ้าแก้
            ระบบจะปรับต้นทุนเฉลี่ยของสินค้าส่วนที่ยังอยู่ในสต็อก ส่วนที่ขายไปแล้วใช้ต้นทุนเดิม
          </DialogDescription>
        </DialogHeader>
        <FormAlert error={verify.error} />
        <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto rounded-md border">
          {parsed.map(({ line, satang }) => (
            <li key={line.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium break-words">{line.productName}</div>
                <div className="text-xs text-muted-foreground">
                  {line.qty.toLocaleString('th-TH')} ชิ้น ·{' '}
                  {line.costSource === 'average'
                    ? `พนักงานไม่ได้กรอก (ใช้ต้นทุนเฉลี่ย ${formatMoney(line.unitCostSatang)})`
                    : `พนักงานกรอก ${formatMoney(line.unitCostSatang)}`}
                </div>
              </div>
              <Field className="w-40" data-invalid={satang === null}>
                <FieldLabel htmlFor={`verify-${line.id}`} className="sr-only">
                  ต้นทุนต่อชิ้น {line.productName}
                </FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    ฿
                  </span>
                  <Input
                    id={`verify-${line.id}`}
                    inputMode="decimal"
                    value={costs[line.id]}
                    onChange={(event) =>
                      setCosts((prev) => ({ ...prev, [line.id]: event.target.value }))
                    }
                    aria-invalid={satang === null}
                    className="pl-7 text-right tabular-nums"
                    autoComplete="off"
                  />
                </div>
                {satang === null && <FieldError>จำนวนเงินไม่ถูกต้อง</FieldError>}
                {satang !== null && (
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    รวม {formatMoney(satang * line.qty)}
                  </span>
                )}
              </Field>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {changed.length > 0 ? `แก้ไข ${changed.length} รายการ` : 'ต้นทุนตรงตามที่กรอกไว้'}
          </span>
          <span>
            ต้นทุนรวม <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={verify.isPending}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={invalid || verify.isPending}>
            {verify.isPending ? 'กำลังบันทึก…' : 'ยืนยันต้นทุน'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Void with a required reason; shows the stock that will go back out. */
export function VoidReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: GoodsReceipt;
  onClose: () => void;
}) {
  const voidReceipt = useVoidReceipt();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = reason.trim() === '';

  const submit = () => {
    setTouched(true);
    if (missing) return;
    voidReceipt.mutate(
      { id: receipt.id, reason },
      { onSuccess: () => (toast.success(`ยกเลิก ${receipt.docNo} แล้ว`), onClose()) },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !voidReceipt.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยกเลิกใบรับสินค้า {receipt.docNo}?</DialogTitle>
          <DialogDescription>
            สินค้าทั้งหมดในใบนี้จะถูกดึงออกจากสต็อก ใบนี้จะยังอยู่ในระบบพร้อมสถานะ “ยกเลิกแล้ว”
            และยกเลิกกลับไม่ได้
          </DialogDescription>
        </DialogHeader>
        <FormAlert error={voidReceipt.error} />
        <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-md border text-sm">
          {receipt.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{line.productName}</span>
              <span className="shrink-0 font-medium text-destructive tabular-nums">
                −{line.qty.toLocaleString('th-TH')}
              </span>
            </li>
          ))}
        </ul>
        <Field data-invalid={touched && missing}>
          <FieldLabel htmlFor="voidReason">
            เหตุผลที่ยกเลิก<span className="text-destructive">*</span>
          </FieldLabel>
          <Textarea
            id="voidReason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น คีย์จำนวนผิด, คืนสินค้าให้ผู้จำหน่าย"
            maxLength={500}
            aria-invalid={touched && missing}
          />
          {touched && missing && <FieldError>กรุณาระบุเหตุผลที่ยกเลิก</FieldError>}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={voidReceipt.isPending}>
            ไม่ยกเลิก
          </Button>
          <Button variant="destructive" onClick={submit} disabled={voidReceipt.isPending}>
            {voidReceipt.isPending ? 'กำลังยกเลิก…' : 'ยกเลิกใบรับสินค้า'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
