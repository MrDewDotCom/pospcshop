import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Minus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { cn } from 'cn';
import {
  MAX_ADJUSTMENT_QTY,
  parseBahtInput,
  type ProductListItem,
  type StockAdjustmentInput,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/components/FormAlert';
import { PageHeader } from '@/components/PageHeader';
import { SerialScanner } from '@/components/SerialScanner';
import { useFormat } from '@/lib/format';
import { ProductThumb } from '@/features/products/ProductsPage';
import { useProduct } from '@/features/products/queries';
import { StockProductPicker } from '@/features/products/StockProductPicker';
import { useAdjustStock, useProductSerials } from './queries';

const REASON_PRESETS = [
  'นับสต็อกไม่ตรง',
  'สินค้าเสียหาย/ใช้งานไม่ได้',
  'ยอดยกมาตอนเริ่มใช้ระบบ',
  'เจอสินค้าเพิ่ม',
];

interface AdjustLine {
  key: number;
  product: ProductListItem;
  direction: 'in' | 'out';
  qtyText: string;
  /** Adding serial stock: new serial numbers. */
  serials: string[];
  /** Removing serial stock: which units. */
  serialIds: number[];
  /** Adding only: cost per unit in baht text; blank = current average. */
  costText: string;
}

function lineQty(line: AdjustLine): number {
  if (line.product.serialRequired) {
    return line.direction === 'in' ? line.serials.length : line.serialIds.length;
  }
  const qty = Number(line.qtyText);
  return Number.isInteger(qty) ? qty : NaN;
}

function lineError(line: AdjustLine): string | null {
  const qty = lineQty(line);
  if (line.product.serialRequired && qty === 0) {
    return line.direction === 'in' ? 'สแกนซีเรียลของชิ้นที่เพิ่ม' : 'เลือกชิ้นที่จะตัดออก';
  }
  if (!Number.isInteger(qty) || qty < 1) return 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0';
  if (qty > MAX_ADJUSTMENT_QTY) return 'จำนวนมากเกินไป';
  if (line.direction === 'out' && !line.product.serialRequired && qty > line.product.onHand) {
    return `ลดได้ไม่เกินคงเหลือ (${line.product.onHand})`;
  }
  if (line.direction === 'in' && line.costText.trim() && parseBahtInput(line.costText) === null) {
    return 'ต้นทุนไม่ถูกต้อง';
  }
  return null;
}

function signedQty(line: AdjustLine): number {
  return (line.direction === 'in' ? 1 : -1) * lineQty(line);
}

/** In-stock units of a serial product, to choose which ones leave. */
function OutSerialPicker({
  line,
  onChange,
}: {
  line: AdjustLine;
  onChange: (serialIds: number[]) => void;
}) {
  const { data: units, isPending } = useProductSerials(line.product.id, 'in_stock');
  const format = useFormat();
  if (isPending) return <p className="text-sm text-muted-foreground">กำลังโหลดซีเรียล…</p>;
  if (!units?.length) return <p className="text-sm text-muted-foreground">ไม่มีชิ้นในสต็อก</p>;
  const toggle = (id: number, checked: boolean) =>
    onChange(checked ? [...line.serialIds, id] : line.serialIds.filter((x) => x !== id));
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">
        เลือกชิ้นที่จะตัดออก ({line.serialIds.length}/{units.length})
      </span>
      <ul className="grid max-h-60 gap-1 overflow-y-auto sm:grid-cols-2">
        {units.map((unit) => (
          <li key={unit.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted">
              <Checkbox
                checked={line.serialIds.includes(unit.id)}
                onCheckedChange={(v) => toggle(unit.id, v === true)}
              />
              <span className="font-mono text-sm">{unit.serialNo}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                รับ {format.date(unit.receivedAt)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineCard({
  line,
  showErrors,
  onChange,
  onRemove,
}: {
  line: AdjustLine;
  showErrors: boolean;
  onChange: (patch: Partial<AdjustLine>) => void;
  onRemove: () => void;
}) {
  const { product } = line;
  const error = showErrors ? lineError(line) : null;
  return (
    <Card className={cn('gap-3 py-4', error && 'border-destructive')}>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-3">
          <ProductThumb url={product.thumbUrl} />
          <div className="min-w-0 flex-1">
            <div className="font-medium break-words">{product.name}</div>
            <div className="text-xs text-muted-foreground">
              {product.sku} · คงเหลือ {product.onHand.toLocaleString('th-TH')}
              {product.serialRequired && ' · มีซีเรียล'}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`ลบ ${product.name}`}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div
            className="inline-flex rounded-md border p-0.5"
            role="radiogroup"
            aria-label="เพิ่มหรือลด"
          >
            {(['in', 'out'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                role="radio"
                aria-checked={line.direction === direction}
                onClick={() => onChange({ direction, serials: [], serialIds: [] })}
                className={cn(
                  'flex items-center gap-1 rounded px-3 py-1.5 text-sm',
                  line.direction === direction &&
                    (direction === 'in' ? 'bg-green-600 text-white' : 'bg-destructive text-white'),
                )}
              >
                {direction === 'in' ? <Plus className="size-4" /> : <Minus className="size-4" />}
                {direction === 'in' ? 'เพิ่ม' : 'ลด'}
              </button>
            ))}
          </div>
          {!product.serialRequired && (
            <Field className="w-28">
              <FieldLabel htmlFor={`qty-${line.key}`}>จำนวน</FieldLabel>
              <Input
                id={`qty-${line.key}`}
                inputMode="numeric"
                value={line.qtyText}
                onChange={(e) => onChange({ qtyText: e.target.value })}
                className="text-right tabular-nums"
              />
            </Field>
          )}
          {line.direction === 'in' && (
            <Field className="w-44">
              <FieldLabel htmlFor={`cost-${line.key}`}>ต้นทุนต่อชิ้น (ถ้ามี)</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  ฿
                </span>
                <Input
                  id={`cost-${line.key}`}
                  inputMode="decimal"
                  value={line.costText}
                  onChange={(e) => onChange({ costText: e.target.value })}
                  placeholder="เว้นว่าง = ต้นทุนเดิม"
                  className="pl-7 text-right tabular-nums"
                  autoComplete="off"
                />
              </div>
            </Field>
          )}
        </div>

        {product.serialRequired && line.direction === 'in' && (
          <SerialScanner
            serials={line.serials}
            label={product.name}
            onChange={(serials) => onChange({ serials })}
          />
        )}
        {product.serialRequired && line.direction === 'out' && (
          <OutSerialPicker line={line} onChange={(serialIds) => onChange({ serialIds })} />
        )}
        {product.serialRequired && line.direction === 'out' && (
          <p className="text-xs text-muted-foreground">ชิ้นที่ตัดออกจะมีสถานะ “ตัดจำหน่าย”</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function StockAdjustPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const adjust = useAdjustStock();
  const [lines, setLines] = useState<AdjustLine[]>([]);
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const nextKey = useRef(1);

  const addProduct = (product: ProductListItem) => {
    setLines((prev) => {
      if (prev.some((l) => l.product.id === product.id)) {
        toast.info(`${product.name} อยู่ในรายการแล้ว`);
        return prev;
      }
      const key = nextKey.current++;
      return [
        ...prev,
        {
          key,
          product,
          direction: 'in',
          qtyText: product.serialRequired ? '' : '1',
          serials: [],
          serialIds: [],
          costText: '',
        },
      ];
    });
  };

  // "ปรับสต็อก" on a product page opens this page with that product ready.
  const preselectId = Number(params.get('productId')) || 0;
  const { data: preselected } = useProduct(preselectId);
  const preselectedDone = useRef(false);
  const addPreselected = useEffectEvent(addProduct);
  useEffect(() => {
    if (!preselected || preselectedDone.current) return;
    preselectedDone.current = true;
    if (preselected.trackStock) addPreselected(preselected);
  }, [preselected]);

  const updateLine = (key: number, patch: Partial<AdjustLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const reasonMissing = reason.trim() === '';
  const review = () => {
    setShowErrors(true);
    if (lines.length === 0) return toast.error('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ');
    if (lines.some((l) => lineError(l)) || reasonMissing) {
      return toast.error('มีข้อมูลที่ยังไม่ครบ กรุณาตรวจสอบ');
    }
    adjust.reset();
    setConfirming(true);
  };

  const submit = () => {
    const input: StockAdjustmentInput = {
      reason,
      lines: lines.map((line) => ({
        productId: line.product.id,
        qtyChange: signedQty(line),
        serials: line.direction === 'in' ? line.serials : [],
        serialIds: line.direction === 'out' ? line.serialIds : [],
        unitCostSatang:
          line.direction === 'in' && line.costText.trim() ? parseBahtInput(line.costText) : null,
      })),
    };
    adjust.mutate(input, {
      onSuccess: (result) => {
        toast.success(`ปรับสต็อกแล้ว (${result.docNo})`);
        navigate(`/stock/movements?q=${encodeURIComponent(result.docNo)}`);
      },
    });
  };

  return (
    <div className="max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/stock/movements">
          <ArrowLeft />
          ความเคลื่อนไหวสต็อก
        </Link>
      </Button>
      <PageHeader
        title="ปรับสต็อก"
        description="ใช้เมื่อนับสต็อกแล้วไม่ตรง สินค้าเสียหาย หรือบันทึกยอดยกมา ทุกการปรับต้องมีเหตุผลและบันทึกไว้ในประวัติ"
      />

      <div className="mb-3">
        <StockProductPicker onAdd={addProduct} />
      </div>

      <div className="flex flex-col gap-3">
        {lines.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground">
            <SlidersHorizontal className="size-8" />
            <p className="text-sm">ค้นหาหรือสแกนสินค้าที่ต้องการปรับ</p>
          </div>
        )}
        {lines.map((line) => (
          <LineCard
            key={line.key}
            line={line}
            showErrors={showErrors}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
          />
        ))}
      </div>

      {lines.length > 0 && (
        <Card className="mt-4">
          <CardContent className="flex flex-col gap-3">
            <Field data-invalid={showErrors && reasonMissing}>
              <FieldLabel htmlFor="reason">
                เหตุผล<span className="text-destructive">*</span>
              </FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {REASON_PRESETS.map((preset) => (
                  <Badge
                    key={preset}
                    asChild
                    variant={reason === preset ? 'default' : 'outline'}
                    className="cursor-pointer"
                  >
                    <button type="button" onClick={() => setReason(preset)}>
                      {preset}
                    </button>
                  </Badge>
                ))}
              </div>
              <Textarea
                id="reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="อธิบายสั้น ๆ ว่าทำไมต้องปรับ"
                aria-invalid={showErrors && reasonMissing}
              />
              {showErrors && reasonMissing && <FieldError>กรุณาระบุเหตุผลที่ปรับสต็อก</FieldError>}
            </Field>
            <div className="flex justify-end">
              <Button size="lg" onClick={review}>
                ตรวจสอบและยืนยันการปรับ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {confirming && (
        <Dialog open onOpenChange={(open) => !open && !adjust.isPending && setConfirming(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>ยืนยันการปรับสต็อก?</DialogTitle>
              <DialogDescription>
                สต็อกจะเปลี่ยนทันทีเมื่อกดยืนยัน เหตุผล: {reason}
              </DialogDescription>
            </DialogHeader>
            <FormAlert error={adjust.error} />
            <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border text-sm">
              {lines.map((line) => {
                const change = signedQty(line);
                return (
                  <li key={line.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{line.product.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                      <span className="text-muted-foreground">{line.product.onHand}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">{line.product.onHand + change}</span>
                      <span className={change > 0 ? 'text-green-700' : 'text-destructive'}>
                        ({change > 0 ? '+' : '−'}
                        {Math.abs(change)})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={adjust.isPending}
              >
                กลับไปแก้ไข
              </Button>
              <Button onClick={submit} disabled={adjust.isPending}>
                {adjust.isPending ? 'กำลังบันทึก…' : 'ยืนยันปรับสต็อก'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
