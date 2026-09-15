import { useState } from 'react';
import { toast } from 'sonner';
import {
  RETURN_RESOLVE_ACTION_LABELS,
  type ResolvedReturnDisposition,
  type ReturnLine,
  type SaleReturn,
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/components/FormAlert';
import { useResolveReturnItem } from './queries';

/** What each decision does to stock, spelled out before confirming (Q1). */
function effectText(disposition: ResolvedReturnDisposition, line: ReturnLine): string {
  const unit = line.serialNo
    ? `ซีเรียล ${line.serialNo}`
    : `${line.qty.toLocaleString('th-TH')} ชิ้น`;
  switch (disposition) {
    case 'restocked':
      return `สต็อกขายได้ของ “${line.productName}” จะเพิ่มขึ้น ${line.qty.toLocaleString('th-TH')} ชิ้น${
        line.serialNo ? ` (${line.serialNo} กลับมาพร้อมขาย และมีป้าย “เคยถูกคืน”)` : ''
      }`;
    case 'sent_to_claim':
      return `${unit} จะอยู่ในสถานะ “อยู่ระหว่างเคลม” สต็อกขายได้ไม่เปลี่ยน`;
    case 'written_off':
      return `${unit} จะถูกตัดจำหน่าย (เสียหาย/ขายไม่ได้) สต็อกขายได้ไม่เปลี่ยน`;
  }
}

export function ResolveDialog({
  ret,
  line,
  disposition,
  onClose,
}: {
  ret: SaleReturn;
  line: ReturnLine;
  disposition: ResolvedReturnDisposition;
  onClose: () => void;
}) {
  const resolve = useResolveReturnItem();
  const [note, setNote] = useState('');
  const label = RETURN_RESOLVE_ACTION_LABELS[disposition];

  const submit = () =>
    resolve.mutate(
      { id: ret.id, itemId: line.id, disposition, note },
      { onSuccess: () => (toast.success(`${label}แล้ว`), onClose()) },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && !resolve.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {label}: {line.productName}
          </DialogTitle>
          <DialogDescription>{effectText(disposition, line)}</DialogDescription>
        </DialogHeader>
        <FormAlert error={resolve.error} />
        <Field>
          <FieldLabel htmlFor="resolveNote">หมายเหตุ</FieldLabel>
          <Textarea
            id="resolveNote"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              disposition === 'restocked'
                ? 'เช่น ตรวจแล้วใช้งานได้ปกติ'
                : disposition === 'sent_to_claim'
                  ? 'เช่น ส่งเคลมกับผู้จำหน่าย'
                  : 'เช่น จอแตก ใช้งานไม่ได้'
            }
            maxLength={500}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={resolve.isPending}>
            ยกเลิก
          </Button>
          <Button
            variant={disposition === 'written_off' ? 'destructive' : 'default'}
            onClick={submit}
            disabled={resolve.isPending}
          >
            {resolve.isPending ? 'กำลังบันทึก…' : `ยืนยัน${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
