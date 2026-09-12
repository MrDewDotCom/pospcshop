import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ScanBarcode, Search, X } from 'lucide-react';
import { cn } from 'cn';
import {
  SERIAL_STATUS_LABELS,
  type ProductListItem,
  type ProductLookupResponse,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceTag } from '@/components/PriceTag';
import { ProductTags } from '@/components/ProductTags';
import { errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { ProductThumb } from '@/features/products/ProductsPage';
import { lookupProductCode, useProducts } from '@/features/products/queries';
import { useSerialSearch } from './queries';

const MATCH_LABELS: Record<ProductLookupResponse['matchedBy'], string> = {
  barcode: 'ตรงกับบาร์โค้ด',
  sku: 'ตรงกับรหัสสินค้า',
  serial: 'ตรงกับซีเรียล',
};

function OnHand({ product }: { product: ProductListItem }) {
  if (!product.trackStock) {
    return <span className="text-sm text-muted-foreground">ไม่นับสต็อก</span>;
  }
  const out = product.onHand <= 0;
  const low = !out && product.onHand <= product.minStock;
  return (
    <div className="text-right">
      <div className="text-xs text-muted-foreground">คงเหลือ</div>
      <div
        className={cn(
          'text-2xl leading-none font-semibold tabular-nums',
          out && 'text-destructive',
          low && 'text-amber-600',
        )}
      >
        {product.onHand.toLocaleString('th-TH')}
      </div>
    </div>
  );
}

function ProductCard({ product, highlight }: { product: ProductListItem; highlight?: string }) {
  return (
    <Link
      to={`/products/${product.id}`}
      className={cn(
        'flex gap-3 rounded-lg border bg-background p-3 hover:bg-accent/50',
        highlight && 'border-primary ring-2 ring-primary/20',
      )}
    >
      <ProductThumb url={product.thumbUrl} className="size-16" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {highlight && <span className="text-xs font-medium text-primary">{highlight}</span>}
        <div className="line-clamp-2 leading-snug font-medium">{product.name}</div>
        <div className="text-xs text-muted-foreground">
          {product.sku}
          {product.barcode && ` · ${product.barcode}`}
        </div>
        <PriceTag
          priceSatang={product.priceSatang}
          regularPriceSatang={product.regularPriceSatang}
        />
        <ProductTags product={product} hide={['discount', 'awaitingPrice']} />
      </div>
      <OnHand product={product} />
    </Link>
  );
}

/**
 * Phone-first stock lookup: type or scan. Enter does an exact barcode/SKU/serial lookup (a scanner
 * sends Enter), with the Thai keyboard layout corrected on the server.
 */
export function StockLookupPage() {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [exact, setExact] = useState<ProductLookupResponse | null>(null);
  const [looking, setLooking] = useState(false);
  useDocumentTitle('เช็คสต็อก');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const products = useProducts({ q: debounced || undefined, pageSize: 20, status: 'active' });
  const serials = useSerialSearch({ q: debounced, pageSize: 5 }, debounced.length >= 3);

  const onEnter = async () => {
    const code = text.trim();
    if (!code) return;
    setLooking(true);
    try {
      const found = await lookupProductCode(code);
      setExact(found);
      if (!found) toast.error(`ไม่พบรหัส "${code}" แบบตรงตัว แสดงผลการค้นหาแทน`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLooking(false);
    }
  };

  const clear = () => {
    setText('');
    setDebounced('');
    setExact(null);
  };

  const list = (products.data?.items ?? []).filter((p) => p.id !== exact?.product.id);
  const serialMatches = debounced.length >= 3 ? (serials.data?.items ?? []) : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">เช็คสต็อก</h1>
      <div className="sticky top-14 z-10 -mx-4 bg-muted/95 px-4 py-2 md:-mx-6 md:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setExact(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void onEnter();
              }
            }}
            placeholder="ชื่อ รหัส บาร์โค้ด หรือซีเรียล"
            aria-label="ค้นหาสินค้า"
            className="h-12 bg-background pr-20 pl-10 text-base"
            autoComplete="off"
            autoFocus
            disabled={looking}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-muted-foreground">
            {text && (
              <Button variant="ghost" size="icon-sm" aria-label="ล้างคำค้น" onClick={clear}>
                <X />
              </Button>
            )}
            <ScanBarcode className="size-5" />
          </div>
        </div>
      </div>

      {exact && (
        <div className="flex flex-col gap-2">
          <ProductCard product={exact.product} highlight={MATCH_LABELS[exact.matchedBy]} />
          {exact.matchedBy === 'serial' && (
            <SerialLine serialNo={exact.code} items={serialMatches} />
          )}
        </div>
      )}

      {serialMatches.length > 0 && !exact && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">ซีเรียลที่ตรง</h2>
          <ul className="divide-y rounded-lg border bg-background">
            {serialMatches.map((unit) => (
              <li key={unit.id}>
                <Link
                  to={`/products/${unit.productId}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm">{unit.serialNo}</div>
                    <div className="truncate text-xs text-muted-foreground">{unit.productName}</div>
                  </div>
                  <SerialStatusBadge status={unit.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        {debounced && (
          <h2 className="text-sm font-medium text-muted-foreground">
            สินค้า {products.data ? `(${products.data.total.toLocaleString('th-TH')})` : ''}
          </h2>
        )}
        {products.isPending && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
        {products.data && list.length === 0 && !exact && (
          <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบสินค้าที่ค้นหา</p>
        )}
        {list.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </div>
  );
}

function SerialStatusBadge({ status }: { status: keyof typeof SERIAL_STATUS_LABELS }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0',
        status === 'in_stock'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {SERIAL_STATUS_LABELS[status]}
    </Badge>
  );
}

function SerialLine({
  serialNo,
  items,
}: {
  serialNo: string;
  items: { id: number; serialNo: string; status: keyof typeof SERIAL_STATUS_LABELS }[];
}) {
  const unit = items.find((u) => u.serialNo.toUpperCase() === serialNo.toUpperCase());
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
      <span>
        ซีเรียล <span className="font-mono">{serialNo}</span>
      </span>
      {unit && <SerialStatusBadge status={unit.status} />}
    </div>
  );
}
