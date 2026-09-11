import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  PackagePlus,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from 'cn';
import {
  MAX_RECEIPT_LINE_QTY,
  formatBaht,
  normalizeScannedCode,
  parseBahtInput,
  type CreateGoodsReceiptInput,
  type ProductListItem,
} from '@pcshop/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/components/FormAlert';
import { PageHeader } from '@/components/PageHeader';
import { errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/queries';
import { ProductThumb } from '@/features/products/ProductsPage';
import { lookupProductCode, useProducts } from '@/features/products/queries';
import { useSupplierOptions } from '@/features/suppliers/queries';
import { SupplierDialog } from '@/features/suppliers/SuppliersPage';
import { useCreateGoodsReceipt } from './queries';

const NO_SUPPLIER = 'none';

interface DraftLine {
  key: number;
  product: ProductListItem;
  qtyText: string;
  /** Baht text; blank = use the product's current average cost. */
  costText: string;
  serials: string[];
}

function lineQty(line: DraftLine): number {
  if (line.product.serialRequired) return line.serials.length;
  const qty = Number(line.qtyText);
  return Number.isInteger(qty) ? qty : NaN;
}

/** Thai error for a line, or null when it's ready to submit. */
function lineError(line: DraftLine): string | null {
  const qty = lineQty(line);
  if (line.product.serialRequired && qty === 0) return 'สแกนซีเรียลอย่างน้อย 1 ชิ้น';
  if (!Number.isInteger(qty) || qty < 1) return 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0';
  if (qty > MAX_RECEIPT_LINE_QTY) return 'จำนวนมากเกินไป';
  if (line.costText.trim() !== '' && parseBahtInput(line.costText) === null) {
    return 'ต้นทุนไม่ถูกต้อง เช่น 1290 หรือ 1,290.50';
  }
  return null;
}

function lineCost(line: DraftLine): number | null {
  return line.costText.trim() === '' ? null : parseBahtInput(line.costText);
}

// ---------- product search / scan ----------

/**
 * Type to search, or scan a barcode: Enter does an exact barcode/SKU lookup (with the Thai-layout fix
 * on the server) and adds the product straight away.
 */
function ProductAdder({ onAdd }: { onAdd: (product: ProductListItem) => void }) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const { data } = useProducts({ q: debounced || undefined, pageSize: 8, status: 'active' });
  const results = debounced ? (data?.items ?? []) : [];

  const add = (product: ProductListItem) => {
    if (!product.trackStock) {
      toast.error(`สินค้า "${product.name}" ไม่ได้นับสต็อก รับเข้าไม่ได้`);
      return;
    }
    onAdd(product);
    setText('');
    setDebounced('');
    setOpen(false);
  };

  const onEnter = async () => {
    const code = text.trim();
    if (!code) return;
    setLooking(true);
    try {
      const found = await lookupProductCode(code);
      if (found?.matchedBy === 'serial') {
        toast.error(`ซีเรียล ${found.code} มีอยู่ในระบบแล้ว (${found.product.name})`);
      } else if (found) {
        add(found.product);
      } else if (results.length === 1) {
        add(results[0]!);
      } else {
        setOpen(true);
        if (results.length === 0) toast.error(`ไม่พบสินค้ารหัส "${code}"`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLooking(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onEnter();
          }
          if (event.key === 'Escape') setOpen(false);
        }}
        placeholder="สแกนบาร์โค้ด หรือพิมพ์ชื่อ/รหัสสินค้าเพื่อเพิ่ม"
        aria-label="เพิ่มสินค้า"
        className="h-11 pr-10 pl-9 text-base"
        autoComplete="off"
        autoFocus
        disabled={looking}
      />
      <ScanBarcode className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
      {open && debounced && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              ไม่พบสินค้า — ถ้าเป็นสินค้าใหม่{' '}
              <Link
                to="/products/new"
                target="_blank"
                className="text-primary underline"
                onMouseDown={(event) => event.preventDefault()}
              >
                เพิ่มสินค้าใหม่
              </Link>{' '}
              ก่อน แล้วค้นหาอีกครั้ง
            </p>
          )}
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              // Keep focus in the input so the list doesn't close before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(product)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent',
                !product.trackStock && 'opacity-50',
              )}
            >
              <ProductThumb url={product.thumbUrl} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{product.name}</div>
                <div className="text-xs text-muted-foreground">
                  {product.sku}
                  {product.trackStock
                    ? ` · คงเหลือ ${product.onHand.toLocaleString('th-TH')}`
                    : ' · ไม่นับสต็อก'}
                </div>
              </div>
              {product.serialRequired && <Badge variant="secondary">มีซีเรียล</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- one line ----------

function SerialScanner({
  line,
  inputRef,
  onChange,
}: {
  line: DraftLine;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (serials: string[]) => void;
}) {
  const [text, setText] = useState('');

  /** Adds serials, skipping ones already scanned on this line (case-insensitive). */
  const addSerials = (raw: string[]) => {
    const next = [...line.serials];
    const seen = new Set(next.map((s) => s.toUpperCase()));
    for (const value of raw) {
      const serial = normalizeScannedCode(value);
      if (!serial) continue;
      if (seen.has(serial.toUpperCase())) {
        toast.error(`ซีเรียล ${serial} สแกนไปแล้ว`);
        continue;
      }
      seen.add(serial.toUpperCase());
      next.push(serial);
    }
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addSerials([text]);
    setText('');
  };

  // Pasting a list (one serial per line) adds them all at once.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!/[\r\n\t]/.test(pasted.trim())) return;
    event.preventDefault();
    addSerials(pasted.split(/[\r\n\t]+/));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="สแกนซีเรียลทีละชิ้น (กด Enter)"
          aria-label={`สแกนซีเรียล ${line.product.name}`}
          className="font-mono"
          autoComplete="off"
        />
        <span className="shrink-0 text-sm font-medium tabular-nums">
          สแกนแล้ว {line.serials.length} ชิ้น
        </span>
      </div>
      {line.serials.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {line.serials.map((serial) => (
            <Badge key={serial} variant="outline" className="gap-1 pr-1 font-mono font-normal">
              {serial}
              <button
                type="button"
                aria-label={`ลบซีเรียล ${serial}`}
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => onChange(line.serials.filter((s) => s !== serial))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function LineCard({
  line,
  index,
  showErrors,
  isStaff,
  serialInputRef,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  showErrors: boolean;
  isStaff: boolean;
  serialInputRef: (el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const error = showErrors ? lineError(line) : null;
  const qty = lineQty(line);
  const cost = lineCost(line);
  const { product } = line;

  return (
    <Card className={cn('gap-3 py-4', error && 'border-destructive')}>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-3">
          <span className="mt-2 w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
            {index + 1}.
          </span>
          <ProductThumb url={product.thumbUrl} />
          <div className="min-w-0 flex-1">
            <div className="font-medium break-words">{product.name}</div>
            <div className="text-xs text-muted-foreground">
              {product.sku} · คงเหลือตอนนี้ {product.onHand.toLocaleString('th-TH')}
              {product.serialRequired && ' · ต้องสแกนซีเรียลทุกชิ้น'}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`ลบ ${product.name}`}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_12rem_1fr] sm:pl-8">
          <Field>
            <FieldLabel htmlFor={`qty-${line.key}`}>จำนวน</FieldLabel>
            {product.serialRequired ? (
              <div className="flex h-9 items-center text-sm font-medium tabular-nums">
                {line.serials.length} ชิ้น
              </div>
            ) : (
              <Input
                id={`qty-${line.key}`}
                inputMode="numeric"
                value={line.qtyText}
                onChange={(event) => onChange({ qtyText: event.target.value })}
                className="text-right tabular-nums"
              />
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`cost-${line.key}`}>ต้นทุนต่อชิ้น (ตามบิล)</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                ฿
              </span>
              <Input
                id={`cost-${line.key}`}
                inputMode="decimal"
                value={line.costText}
                onChange={(event) => onChange({ costText: event.target.value })}
                placeholder={isStaff ? 'ไม่ทราบ เว้นว่างได้' : 'เว้นว่าง = ใช้ต้นทุนเดิม'}
                className="pl-7 text-right tabular-nums"
                autoComplete="off"
              />
            </div>
          </Field>
          <div className="flex items-end pb-2 text-sm text-muted-foreground sm:justify-end">
            {cost !== null && Number.isInteger(qty) && qty > 0 && (
              <span>
                รวม <span className="text-foreground tabular-nums">{formatMoney(cost * qty)}</span>
              </span>
            )}
          </div>
        </div>

        {product.serialRequired && (
          <div className="sm:pl-8">
            <SerialScanner
              line={line}
              inputRef={serialInputRef}
              onChange={(serials) => onChange({ serials })}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive sm:pl-8">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ---------- confirm ----------

function ConfirmReceiveDialog({
  lines,
  isStaff,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  lines: DraftLine[];
  isStaff: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const totalQty = lines.reduce((sum, line) => sum + lineQty(line), 0);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ยืนยันรับสินค้าเข้าสต็อก?</DialogTitle>
          <DialogDescription>
            สต็อกจะเพิ่มทันทีเมื่อกดยืนยัน รวม {lines.length} รายการ{' '}
            {totalQty.toLocaleString('th-TH')} ชิ้น
          </DialogDescription>
        </DialogHeader>
        <FormAlert error={error} />
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border text-sm">
          {lines.map((line) => {
            const qty = lineQty(line);
            return (
              <li key={line.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{line.product.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                  <span className="text-muted-foreground">{line.product.onHand}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{line.product.onHand + qty}</span>
                  <span className="text-green-700">(+{qty})</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">
          {isStaff
            ? 'ต้นทุนที่กรอกจะรอเจ้าของร้านตรวจสอบ และหลังบันทึกแล้วพนักงานจะดูต้นทุนย้อนหลังไม่ได้'
            : 'ถ้ารับผิด เจ้าของร้านยกเลิกใบรับสินค้าได้ภายหลัง (สต็อกจะถูกดึงออก)'}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            กลับไปแก้ไข
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'กำลังบันทึก…' : 'ยืนยันรับสินค้า'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- page ----------

export function ReceivingFormPage() {
  const user = useCurrentUser();
  const isStaff = !user.can('cost.view');
  const navigate = useNavigate();
  const { data: suppliers } = useSupplierOptions();
  const create = useCreateGoodsReceipt();

  const [supplierId, setSupplierId] = useState<string>(NO_SUPPLIER);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const nextKey = useRef(1);
  const serialInputs = useRef(new Map<number, HTMLInputElement>());
  const savedRef = useRef(false);

  // Don't lose a half-scanned receipt by clicking away. The function form is evaluated at navigation
  // time, so the redirect after saving (savedRef set just before) isn't blocked.
  const dirty = lines.length > 0 || invoiceNo !== '' || notes !== '';
  const blocker = useBlocker(() => dirty && !savedRef.current);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const focusSerialInput = (key: number) =>
    requestAnimationFrame(() => serialInputs.current.get(key)?.focus());

  const addProduct = (product: ProductListItem) => {
    const existing = lines.find((line) => line.product.id === product.id);
    if (existing) {
      if (product.serialRequired) {
        focusSerialInput(existing.key);
      } else {
        // Scanning the same barcode again counts one more unit.
        const qty = Number(existing.qtyText);
        updateLine(existing.key, {
          qtyText: String(Number.isInteger(qty) ? qty + 1 : 1),
        });
        toast.success(`${product.name} +1`);
      }
      return;
    }
    const key = nextKey.current++;
    setLines((prev) => [
      ...prev,
      { key, product, qtyText: product.serialRequired ? '' : '1', costText: '', serials: [] },
    ]);
    if (product.serialRequired) focusSerialInput(key);
  };

  const updateLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const totalQty = lines.reduce((sum, line) => sum + (lineQty(line) || 0), 0);
  const enteredTotal = lines.reduce((sum, line) => {
    const cost = lineCost(line);
    const qty = lineQty(line);
    return cost !== null && Number.isInteger(qty) ? sum + cost * qty : sum;
  }, 0);
  const blankCostLines = lines.filter((line) => line.costText.trim() === '').length;

  const review = () => {
    setShowErrors(true);
    if (lines.length === 0) {
      toast.error('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    if (lines.some((line) => lineError(line) !== null)) {
      toast.error('มีรายการที่ยังไม่ครบ กรุณาตรวจสอบ');
      return;
    }
    create.reset();
    setConfirming(true);
  };

  const submit = () => {
    const input: CreateGoodsReceiptInput = {
      supplierId: supplierId === NO_SUPPLIER ? null : Number(supplierId),
      supplierInvoiceNo: invoiceNo,
      notes,
      lines: lines.map((line) => ({
        productId: line.product.id,
        qty: lineQty(line),
        unitCostSatang: lineCost(line),
        serials: line.serials,
      })),
    };
    create.mutate(input, {
      onSuccess: (receipt) => {
        savedRef.current = true;
        toast.success(`รับสินค้าเข้าแล้ว (${receipt.docNo})`);
        navigate(`/receiving/${receipt.id}`, { replace: true });
      },
    });
  };

  return (
    <div className="max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/receiving">
          <ArrowLeft />
          รายการรับสินค้า
        </Link>
      </Button>
      <PageHeader
        title="รับสินค้าเข้า"
        description="สแกนบาร์โค้ดสินค้า แล้วสแกนซีเรียลทีละชิ้นสำหรับสินค้าที่มีซีเรียล"
      />

      <Card className="mb-4">
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier">ผู้จำหน่าย</FieldLabel>
              <div className="flex gap-2">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="supplier" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>ไม่ระบุ</SelectItem>
                    {suppliers?.items.map((supplier) => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {user.can('supplier.edit') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="เพิ่มผู้จำหน่าย"
                    title="เพิ่มผู้จำหน่าย"
                    onClick={() => setAddingSupplier(true)}
                  >
                    <Plus />
                  </Button>
                )}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="invoiceNo">เลขที่บิล/ใบส่งของของผู้จำหน่าย</FieldLabel>
              <Input
                id="invoiceNo"
                value={invoiceNo}
                onChange={(event) => setInvoiceNo(event.target.value)}
                maxLength={60}
                autoComplete="off"
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="notes">หมายเหตุ</FieldLabel>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="mb-3">
        <ProductAdder onAdd={addProduct} />
      </div>

      <div className="flex flex-col gap-3">
        {lines.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground">
            <PackagePlus className="size-8" />
            <p className="text-sm">ยังไม่มีรายการ สแกนบาร์โค้ดหรือค้นหาสินค้าด้านบน</p>
          </div>
        )}
        {lines.map((line, index) => (
          <LineCard
            key={line.key}
            line={line}
            index={index}
            showErrors={showErrors}
            isStaff={isStaff}
            serialInputRef={(el) => {
              if (el) serialInputs.current.set(line.key, el);
              else serialInputs.current.delete(line.key);
            }}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
          />
        ))}
      </div>

      {lines.length > 0 && (
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3">
          <div className="text-sm">
            <div>
              รวม {lines.length} รายการ ·{' '}
              <span className="font-semibold tabular-nums">
                {totalQty.toLocaleString('th-TH')} ชิ้น
              </span>
            </div>
            <div className="text-muted-foreground">
              ต้นทุนตามที่กรอก ฿{formatBaht(enteredTotal, { decimals: 'auto' })}
              {blankCostLines > 0 && ` (ไม่ได้กรอก ${blankCostLines} รายการ)`}
            </div>
          </div>
          <Button size="lg" onClick={review}>
            ตรวจสอบและยืนยันรับสินค้า
          </Button>
        </div>
      )}

      {confirming && (
        <ConfirmReceiveDialog
          lines={lines}
          isStaff={isStaff}
          pending={create.isPending}
          error={create.error}
          onConfirm={submit}
          onClose={() => setConfirming(false)}
        />
      )}
      {addingSupplier && (
        <SupplierDialog
          supplier={null}
          onClose={() => setAddingSupplier(false)}
          onSaved={(supplier) => setSupplierId(String(supplier.id))}
        />
      )}
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ออกจากหน้านี้?</AlertDialogTitle>
            <AlertDialogDescription>
              รายการที่สแกนไว้ยังไม่ได้บันทึก ถ้าออกตอนนี้รายการทั้งหมดจะหายไป
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>อยู่ต่อ</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              ออกโดยไม่บันทึก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
