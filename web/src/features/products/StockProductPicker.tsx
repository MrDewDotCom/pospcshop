import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ScanBarcode, Search } from 'lucide-react';
import { cn } from 'cn';
import type { ProductListItem } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { ProductThumb } from './ProductsPage';
import { lookupProductCode, useProducts } from './queries';

/**
 * Picks a stock-tracked product for receiving or adjusting: type to search, or scan a barcode (Enter
 * does an exact barcode/SKU lookup, with the Thai-layout fix on the server) to add it straight away.
 */
export function StockProductPicker({
  onAdd,
  autoFocus = true,
}: {
  onAdd: (product: ProductListItem) => void;
  autoFocus?: boolean;
}) {
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
      toast.error(`สินค้า "${product.name}" ไม่ได้นับสต็อก`);
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
        autoFocus={autoFocus}
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
