import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ScanBarcode, Search } from 'lucide-react';
import { cn } from 'cn';
import type { ProductListItem, SerialItem } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PriceTag } from '@/components/PriceTag';
import { ProductTags } from '@/components/ProductTags';
import { api, errorMessage } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { ProductThumb } from '@/features/products/ProductsPage';
import { lookupProductCode, useProducts } from '@/features/products/queries';
import type { CartSerial } from './usePosCart';

function stockText(product: ProductListItem) {
  if (!product.trackStock) return 'ไม่นับสต็อก';
  return `คงเหลือ ${product.onHand.toLocaleString('th-TH')}`;
}

/**
 * The POS search box. A barcode scanner types the code and presses Enter: that does an exact
 * barcode/SKU/serial lookup (the server retries codes typed with the Thai keyboard layout, P6). A
 * scanned serial adds the product with that unit already chosen (P7). Typing shows search results;
 * arrow keys + Enter or a click add one.
 */
export function PosScanBox({
  inputRef,
  onAdd,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  /** `serial` is set when a serial number was scanned. */
  onAdd: (product: ProductListItem, serial?: CartSerial) => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [looking, setLooking] = useState(false);
  const debounced = useDebouncedValue(text.trim(), 200);
  const { data } = useProducts({ q: debounced || undefined, pageSize: 8, status: 'active' });
  const results = debounced ? (data?.items ?? []) : [];

  const reset = () => {
    setText('');
    setOpen(false);
    setHighlight(-1);
  };

  const add = (product: ProductListItem, serial?: CartSerial) => {
    if (product.priceSatang === null) {
      toast.error(`"${product.name}" ยังไม่ได้ตั้งราคา ขายไม่ได้ (ให้เจ้าของร้านตั้งราคาก่อน)`);
      return;
    }
    onAdd(product, serial);
    reset();
  };

  const onEnter = async () => {
    if (highlight >= 0 && results[highlight]) {
      add(results[highlight]);
      return;
    }
    const code = text.trim();
    if (!code) return;
    setLooking(true);
    try {
      const found = await lookupProductCode(code);
      if (found?.matchedBy === 'serial' && found.serialItemId) {
        // Only a unit that's still in stock can be sold.
        const units = await api
          .get<{
            items: SerialItem[];
          }>(`/api/products/${found.product.id}/serials?status=in_stock`)
          .then((r) => r.items);
        const unit = units.find((u) => u.id === found.serialItemId);
        if (unit) add(found.product, { id: unit.id, serialNo: unit.serialNo });
        else toast.error(`ซีเรียล ${found.code} ไม่ได้อยู่ในสต็อก (อาจขายไปแล้ว)`);
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
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onEnter();
          } else if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            setOpen(true);
            setHighlight((h) => (h + 1) % results.length);
          } else if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault();
            setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1));
          } else if (event.key === 'Escape') {
            reset();
          }
        }}
        placeholder="สแกนบาร์โค้ด/ซีเรียล หรือพิมพ์ชื่อสินค้า"
        aria-label="ค้นหาหรือสแกนสินค้า"
        className="h-12 pr-11 pl-10 text-base"
        autoComplete="off"
        autoFocus
        disabled={looking}
      />
      <ScanBarcode className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
      {open && debounced && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-[26rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          {results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">ไม่พบสินค้า</p>
          )}
          {results.map((product, index) => {
            const unpriced = product.priceSatang === null;
            const soldOut = product.trackStock && product.onHand <= 0;
            return (
              <button
                key={product.id}
                type="button"
                // Keep focus in the input so the list doesn't close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(product)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left',
                  index === highlight && 'bg-accent',
                  (unpriced || soldOut) && 'opacity-60',
                )}
              >
                <ProductThumb url={product.thumbUrl} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{product.name}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{product.sku}</span>
                    <span className={cn(soldOut && 'font-medium text-destructive')}>
                      {stockText(product)}
                    </span>
                    {product.serialRequired && <Badge variant="secondary">มีซีเรียล</Badge>}
                  </div>
                  <ProductTags
                    product={product}
                    hide={['discount', 'stock', 'awaitingPrice']}
                    className="mt-0.5"
                  />
                </div>
                <PriceTag
                  priceSatang={product.priceSatang}
                  regularPriceSatang={product.regularPriceSatang}
                  size="sm"
                  className="shrink-0 justify-end"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
