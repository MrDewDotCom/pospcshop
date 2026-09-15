import { useState } from 'react';
import { Banknote, Loader2, QrCode as QrIcon } from 'lucide-react';
import { cn } from 'cn';
import {
  checkPayment,
  isPromptpayId,
  parseBahtInput,
  PAYMENT_PROBLEM_MESSAGES,
  promptpayPayload,
  satangToInput,
  type CheckoutPaymentMethod,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormAlert } from '@/components/FormAlert';
import { QrCode } from '@/components/QrCode';
import { formatMoney } from '@/lib/format';
import { useShopSettings } from '@/features/settings/queries';
import type { CartItem } from './usePosCart';

/** Round-up amounts a customer is likely to hand over: the exact total, then the next 100/500/1000. */
function cashSuggestions(total: number): number[] {
  const roundUp = (step: number) => (total % step === 0 ? total : total + step - (total % step));
  return [...new Set([total, roundUp(100_00), roundUp(500_00), roundUp(1000_00)])].sort(
    (a, b) => a - b,
  );
}

/** What confirming does to stock (every stock-changing action shows this before it happens). */
function StockEffect({ items }: { items: CartItem[] }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <div className="mb-1 font-medium">เมื่อยืนยัน ระบบจะตัดสต็อก</div>
      <ul className="space-y-0.5 text-muted-foreground">
        {items.map((item) => (
          <li key={item.product.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {item.product.name}
              {item.serials.length > 0 && (
                <span className="font-mono text-xs">
                  {' '}
                  ({item.serials.map((s) => s.serialNo).join(', ')})
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              {item.product.trackStock ? `−${item.qty.toLocaleString('th-TH')}` : 'ไม่ตัดสต็อก'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaymentDialog({
  items,
  totalSatang,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  items: CartItem[];
  totalSatang: number;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (method: CheckoutPaymentMethod, receivedSatang: number) => void;
}) {
  const { data: settings } = useShopSettings();
  const [method, setMethod] = useState<CheckoutPaymentMethod>('cash');
  const [text, setText] = useState('');
  const received = parseBahtInput(text);
  const check = received === null ? null : checkPayment(method, received, totalSatang);
  const canConfirm = check?.ok === true && !pending;
  const promptpayId = settings?.promptpayId ?? '';

  const confirm = () => {
    if (canConfirm && received !== null) onConfirm(method, received);
  };
  const switchTo = (next: CheckoutPaymentMethod) => {
    setMethod(next);
    setText('');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>รับชำระเงิน</DialogTitle>
          <DialogDescription>เลือกวิธีชำระ แล้วกรอกจำนวนเงินที่ได้รับจริง</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-primary/5 py-3 text-center">
          <div className="text-sm text-muted-foreground">ยอดที่ต้องชำระ</div>
          <div className="text-4xl font-bold tabular-nums">{formatMoney(totalSatang)}</div>
        </div>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="วิธีชำระเงิน">
          {(
            [
              ['cash', 'เงินสด', Banknote],
              ['transfer', 'โอน/พร้อมเพย์', QrIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              variant={method === value ? 'default' : 'outline'}
              className="h-12 text-base"
              onClick={() => switchTo(value)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>

        {method === 'transfer' && (
          <div className="flex flex-col items-center gap-1 rounded-lg border p-3">
            {isPromptpayId(promptpayId) ? (
              <>
                <QrCode text={promptpayPayload(promptpayId, totalSatang)} size={200} />
                <div className="text-sm">
                  พร้อมเพย์ {promptpayId} · {formatMoney(totalSatang)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ให้ลูกค้าสแกน แล้วตรวจสอบว่าเงินเข้าบัญชีร้านก่อนยืนยัน
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                ยังไม่ได้ตั้งค่าพร้อมเพย์ของร้าน (เจ้าของร้านตั้งได้ที่ ตั้งค่า › ข้อมูลร้าน)
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="received">
            {method === 'cash' ? 'รับเงินสดมา' : 'ยอดโอนที่ได้รับ (ต้องเท่ากับยอดที่ต้องชำระ)'}
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg text-muted-foreground">
              ฿
            </span>
            <Input
              id="received"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirm();
                }
              }}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className="h-12 pl-8 text-right text-2xl tabular-nums"
              aria-invalid={check?.ok === false}
            />
          </div>
          {method === 'cash' && (
            <div className="flex flex-wrap gap-2">
              {cashSuggestions(totalSatang).map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="tabular-nums"
                  onClick={() => setText(satangToInput(amount))}
                >
                  {amount === totalSatang ? 'พอดี' : formatMoney(amount)}
                </Button>
              ))}
            </div>
          )}
          {check?.ok === false && (
            <p className="text-sm text-destructive">{PAYMENT_PROBLEM_MESSAGES[check.problem!]}</p>
          )}
        </div>

        {method === 'cash' && (
          <div
            className={cn(
              'rounded-lg border py-2 text-center',
              check?.ok ? 'border-emerald-300 bg-emerald-50' : 'bg-muted/40',
            )}
          >
            <div className="text-sm text-muted-foreground">เงินทอน</div>
            <div className="text-3xl font-bold text-emerald-700 tabular-nums">
              {check?.ok ? formatMoney(check.changeSatang) : '–'}
            </div>
          </div>
        )}

        <StockEffect items={items} />
        <FormAlert error={error} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            กลับไปแก้ตะกร้า
          </Button>
          <Button onClick={confirm} disabled={!canConfirm} className="min-w-40">
            {pending && <Loader2 className="animate-spin" />}
            ยืนยันการขาย
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
