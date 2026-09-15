import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ListChecks,
  Minus,
  Plus,
  ReceiptText,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { cn } from 'cn';
import {
  cartTotals,
  lineSavingsSatang,
  PAYMENT_METHOD_LABELS,
  type CheckoutPaymentMethod,
  type Product,
  type Sale,
} from '@pcshop/shared';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PriceTag } from '@/components/PriceTag';
import { ProductTags } from '@/components/ProductTags';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useCurrentUser } from '@/features/auth/queries';
import { ProductThumb } from '@/features/products/ProductsPage';
import { useCheckout } from '@/features/sales/queries';
import { useShopSettings } from '@/features/settings/queries';
import { CustomerPicker } from './CustomerPicker';
import { PaymentDialog } from './PaymentDialog';
import { PosScanBox } from './PosScanBox';
import { SerialPickerDialog } from './SerialPickerDialog';
import { itemProblem, MAX_QTY, toCartLines, usePosCart, type CartItem } from './usePosCart';

/** Errors after which the cart's product data (price, stock) is out of date and gets reloaded. */
const STALE_CART_ERRORS = [
  'PRICE_CHANGED',
  'INSUFFICIENT_STOCK',
  'SERIAL_NOT_IN_STOCK',
  'SERIAL_NOT_FOUND',
  'AWAITING_PRICE',
  'PRODUCT_ARCHIVED',
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function CartRow({
  item,
  problem,
  onQty,
  onPickSerials,
  onRemove,
}: {
  item: CartItem;
  problem: string | null;
  onQty: (qty: number) => void;
  onPickSerials: () => void;
  onRemove: () => void;
}) {
  const { product } = item;
  const line = {
    unitPriceSatang: product.priceSatang ?? 0,
    regularPriceSatang: product.regularPriceSatang,
    qty: item.qty,
  };
  const savings = lineSavingsSatang(line);

  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 border-b px-3 py-3 last:border-b-0 sm:flex-nowrap',
        problem && 'bg-destructive/5',
      )}
    >
      <ProductThumb url={product.thumbUrl} className="size-12" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{product.name}</div>
        <div className="text-xs text-muted-foreground">
          {product.sku}
          {product.trackStock && ` · คงเหลือ ${product.onHand.toLocaleString('th-TH')}`}
        </div>
        <ProductTags
          product={product}
          hide={['discount', 'stock', 'awaitingPrice']}
          className="mt-1"
        />
        {product.serialRequired && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {item.serials.map((s) => (
              <span
                key={s.id}
                className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs"
              >
                {s.serialNo}
              </span>
            ))}
            <Button variant="outline" size="xs" onClick={onPickSerials}>
              <ListChecks />
              {item.serials.length ? 'เปลี่ยนซีเรียล' : 'เลือกซีเรียล'}
            </Button>
          </div>
        )}
        {problem && <div className="mt-1 text-sm font-medium text-destructive">{problem}</div>}
      </div>

      <div className="flex items-center gap-1">
        {product.serialRequired ? (
          <span className="w-24 text-center text-sm tabular-nums">
            {item.qty.toLocaleString('th-TH')} ชิ้น
          </span>
        ) : (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="ลดจำนวน"
              onClick={() => onQty(item.qty - 1)}
              disabled={item.qty <= 1}
            >
              <Minus />
            </Button>
            <Input
              value={item.qty}
              onChange={(event) => onQty(Number(event.target.value.replace(/\D/g, '')))}
              inputMode="numeric"
              aria-label="จำนวน"
              className="h-8 w-14 text-center tabular-nums"
            />
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="เพิ่มจำนวน"
              onClick={() => onQty(item.qty + 1)}
              disabled={item.qty >= MAX_QTY}
            >
              <Plus />
            </Button>
          </>
        )}
      </div>

      <div className="w-32 text-right">
        <PriceTag
          priceSatang={product.priceSatang}
          regularPriceSatang={product.regularPriceSatang}
          size="sm"
          className="justify-end"
        />
        <div className="mt-0.5 font-semibold tabular-nums">
          {formatMoney((product.priceSatang ?? 0) * item.qty)}
        </div>
        {savings > 0 && (
          <div className="text-xs text-red-600 tabular-nums">ประหยัด {formatMoney(savings)}</div>
        )}
      </div>

      <Button variant="ghost" size="icon-sm" aria-label="ลบรายการ" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function SaleCompleteDialog({
  sale,
  onNext,
  onOpenReceipt,
}: {
  sale: Sale;
  onNext: () => void;
  onOpenReceipt: () => void;
}) {
  const payment = sale.payment;
  return (
    <Dialog open onOpenChange={(open) => !open && onNext()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <CheckCircle2 className="size-12 text-emerald-600" />
          <DialogTitle>ขายสำเร็จ</DialogTitle>
          <DialogDescription>
            บิล {sale.docNo} · {payment ? PAYMENT_METHOD_LABELS[payment.method] : ''}{' '}
            {formatMoney(sale.totalSatang)}
          </DialogDescription>
        </DialogHeader>
        {payment?.method === 'cash' && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 py-3 text-center">
            <div className="text-sm text-muted-foreground">
              รับมา {formatMoney(payment.receivedSatang)} · เงินทอน
            </div>
            <div className="text-4xl font-bold text-emerald-700 tabular-nums">
              {formatMoney(payment.changeSatang)}
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onOpenReceipt}>
            <ReceiptText />
            ดูใบเสร็จ
          </Button>
          <Button onClick={onNext} autoFocus>
            ขายบิลถัดไป
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PosPage() {
  useDocumentTitle('ขายสินค้า');
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { data: settings } = useShopSettings();
  const allowNegative = settings?.allowNegativeStock ?? false;
  const [cart, dispatch] = usePosCart(user.id);
  const [serialFor, setSerialFor] = useState<CartItem | null>(null);
  const [paying, setPaying] = useState(false);
  const [completed, setCompleted] = useState<Sale | null>(null);
  const checkout = useCheckout();
  const scanRef = useRef<HTMLInputElement>(null);
  const focusScan = () => requestAnimationFrame(() => scanRef.current?.focus());

  const totals = cartTotals(toCartLines(cart.items));
  const problems = cart.items.map((item) => itemProblem(item, allowNegative));
  const canPay = cart.items.length > 0 && problems.every((p) => p === null);
  const dialogOpen = serialFor !== null || paying || completed !== null;

  // Keep the scan box ready: a scanner (or typing) while nothing editable has focus goes there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogOpen || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1 || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      scanRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const addProduct = (product: CartItem['product'], serial?: CartItem['serials'][number]) => {
    dispatch({ type: 'add', product, serial });
    // A serial product added by name/barcode (not by its serial) needs its unit chosen.
    if (product.serialRequired && !serial) {
      const current = cart.items.find((i) => i.product.id === product.id);
      setSerialFor(current ?? { product, qty: 0, serials: [] });
    }
  };

  /** Reloads the products in the cart (new prices, stock) after the server refused the sale. */
  const refreshCart = async () => {
    try {
      const products = await Promise.all(
        cart.items.map((item) => api.get<Product>(`/api/products/${item.product.id}`)),
      );
      dispatch({ type: 'refreshProducts', products });
    } catch {
      // The error from checkout is already on screen.
    }
  };

  const confirmSale = (method: CheckoutPaymentMethod, receivedSatang: number) =>
    checkout.mutate(
      {
        items: cart.items.map((item) => ({
          productId: item.product.id,
          qty: item.qty,
          serialItemIds: item.serials.map((s) => s.id),
        })),
        customerId: cart.customer?.id ?? null,
        note: cart.note,
        payment: { method, receivedSatang },
        expectedTotalSatang: totals.totalSatang,
      },
      {
        onSuccess: (sale) => {
          dispatch({ type: 'clear' });
          setPaying(false);
          setCompleted(sale);
        },
        onError: async (error) => {
          if (!(error instanceof ApiError) || !STALE_CART_ERRORS.includes(error.code)) return;
          await refreshCart();
          if (error.code === 'PRICE_CHANGED') {
            // The total changed: go back to the cart so the cashier sees and tells the customer.
            setPaying(false);
            toast.error(error.message);
          }
        },
      },
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold">ขายสินค้า</h1>
        </div>
        <PosScanBox inputRef={scanRef} onAdd={addProduct} />

        <Card className="py-0">
          <CardContent className="px-0">
            {cart.items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                <ShoppingCart className="size-10 opacity-40" />
                <p>สแกนบาร์โค้ด หรือพิมพ์ชื่อสินค้าเพื่อเริ่มขาย</p>
                <p className="text-xs">ตะกร้ายังไม่ตัดสต็อก จะตัดเมื่อยืนยันการขายเท่านั้น</p>
              </div>
            ) : (
              cart.items.map((item, index) => (
                <CartRow
                  key={item.product.id}
                  item={item}
                  problem={problems[index] ?? null}
                  onQty={(qty) => dispatch({ type: 'setQty', productId: item.product.id, qty })}
                  onPickSerials={() => setSerialFor(item)}
                  onRemove={() => {
                    dispatch({ type: 'remove', productId: item.product.id });
                    focusScan();
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-3 self-start lg:sticky lg:top-20">
        <CustomerPicker
          customer={cart.customer}
          onChange={(customer) => dispatch({ type: 'setCustomer', customer })}
          onDialogClose={focusScan}
        />
        <Textarea
          value={cart.note}
          onChange={(event) => dispatch({ type: 'setNote', note: event.target.value })}
          placeholder="หมายเหตุในบิล (ถ้ามี)"
          aria-label="หมายเหตุ"
          maxLength={500}
          rows={2}
          className="bg-background"
        />
        <Card>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">จำนวน</span>
              <span className="tabular-nums">{totals.itemCount.toLocaleString('th-TH')} ชิ้น</span>
            </div>
            {totals.savingsSatang > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>ประหยัดไป</span>
                <span className="tabular-nums">{formatMoney(totals.savingsSatang)}</span>
              </div>
            )}
            <div className="flex items-end justify-between border-t pt-2">
              <span className="text-muted-foreground">ยอดรวม</span>
              <span className="text-3xl font-bold tabular-nums">
                {formatMoney(totals.totalSatang)}
              </span>
            </div>
            <Button
              className="h-14 w-full text-lg"
              disabled={!canPay || !user.can('sale.create')}
              onClick={() => {
                checkout.reset();
                setPaying(true);
              }}
            >
              ชำระเงิน
            </Button>
            {cart.items.length > 0 && (
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  dispatch({ type: 'clear' });
                  focusScan();
                }}
              >
                <Trash2 />
                ล้างตะกร้า
              </Button>
            )}
          </CardContent>
        </Card>
      </aside>

      {serialFor && (
        <SerialPickerDialog
          product={serialFor.product}
          selected={cart.items.find((i) => i.product.id === serialFor.product.id)?.serials ?? []}
          onClose={() => {
            // A serial product that never got a unit leaves the cart again.
            const current = cart.items.find((i) => i.product.id === serialFor.product.id);
            if (current && current.serials.length === 0) {
              dispatch({ type: 'remove', productId: serialFor.product.id });
            }
            setSerialFor(null);
            focusScan();
          }}
          onDone={(serials) => {
            dispatch({ type: 'setSerials', productId: serialFor.product.id, serials });
            setSerialFor(null);
            focusScan();
          }}
        />
      )}
      {paying && (
        <PaymentDialog
          items={cart.items}
          totalSatang={totals.totalSatang}
          pending={checkout.isPending}
          error={checkout.error}
          onClose={() => {
            setPaying(false);
            focusScan();
          }}
          onConfirm={confirmSale}
        />
      )}
      {completed && (
        <SaleCompleteDialog
          sale={completed}
          onOpenReceipt={() => navigate(`/sales/${completed.id}?receipt=1`)}
          onNext={() => {
            setCompleted(null);
            focusScan();
          }}
        />
      )}
    </div>
  );
}
