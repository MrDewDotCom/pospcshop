import { useEffect, useEffectEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ImageOff, Plus, ScanBarcode, Search } from 'lucide-react';
import { cn } from 'cn';
import {
  PRODUCT_CONDITION_LABELS,
  type ListProductsQuery,
  type ProductListItem,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { PriceTag } from '@/components/PriceTag';
import { ProductTags } from '@/components/ProductTags';
import { errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/queries';
import { useCategories } from '@/features/categories/queries';
import { useTags } from '@/features/tags/queries';
import { lookupProductCode, useProducts } from './queries';

const PAGE_SIZE = 25;
const ALL = 'all';

const STOCK_OPTIONS = [
  { value: ALL, label: 'สต็อกทั้งหมด' },
  { value: 'in', label: 'มีของ' },
  { value: 'low', label: 'ใกล้หมด' },
  { value: 'out', label: 'หมด' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'สินค้าที่ขายอยู่' },
  { value: 'awaitingPrice', label: 'รอตั้งราคา' },
  { value: 'archived', label: 'ซ่อนไว้' },
];
const SORT_OPTIONS = [
  { value: 'name', label: 'เรียงตามชื่อ' },
  { value: 'newest', label: 'เพิ่มล่าสุด' },
  { value: 'price', label: 'ราคาต่ำ → สูง' },
  { value: 'stock', label: 'คงเหลือน้อย → มาก' },
];

function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn('w-full sm:w-auto', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StockText({ product }: { product: ProductListItem }) {
  if (!product.trackStock) return <span className="text-muted-foreground">ไม่นับสต็อก</span>;
  const out = product.onHand <= 0;
  const low = !out && product.onHand <= product.minStock;
  return (
    <span
      className={cn(
        'tabular-nums',
        out && 'font-medium text-destructive',
        low && 'font-medium text-amber-600',
      )}
    >
      {product.onHand.toLocaleString('th-TH')}
      {out && ' (หมด)'}
      {low && ' (ใกล้หมด)'}
    </span>
  );
}

export function ProductThumb({ url, className }: { url: string | null; className?: string }) {
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * Search box: typing filters the list; pressing Enter (which barcode scanners send after the code)
 * first tries an exact barcode/SKU/serial match and opens that product.
 */
function SearchBox({ value, onSearch }: { value: string; onSearch: (text: string) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState(value);
  const [looking, setLooking] = useState(false);

  // Follow the URL when it changes from outside (back button, cleared filters).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== text.trim()) setText(value);
  }

  const search = useEffectEvent((next: string) => onSearch(next));
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => search(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value]);

  const onEnter = async () => {
    const code = text.trim();
    if (!code) return;
    setLooking(true);
    try {
      const found = await lookupProductCode(code);
      if (found) {
        if (found.matchedBy === 'serial') toast.success(`พบจากซีเรียล ${found.code}`);
        navigate(`/products/${found.product.id}`);
        return;
      }
      onSearch(code);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onEnter();
          }
        }}
        placeholder="ค้นหาชื่อ ยี่ห้อ รหัส หรือสแกนบาร์โค้ด"
        aria-label="ค้นหาสินค้า"
        className="pr-9 pl-9"
        autoComplete="off"
        disabled={looking}
      />
      <ScanBarcode className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function ProductsPage() {
  const user = useCurrentUser();
  const showCost = user.can('cost.view');
  const [params, setParams] = useSearchParams();
  const { data: categories } = useCategories();
  const { data: tags } = useTags();

  const param = (key: string) => params.get(key) ?? undefined;
  const page = Number(params.get('page') ?? 1) || 1;
  const query: ListProductsQuery = {
    q: param('q'),
    categoryId: param('categoryId'),
    tagId: param('tagId'),
    condition: param('condition') as ListProductsQuery['condition'],
    stock: param('stock') as ListProductsQuery['stock'],
    discounted: params.get('discounted') === 'true' ? 'true' : undefined,
    status: (param('status') ?? 'active') as ListProductsQuery['status'],
    sort: (param('sort') ?? 'name') as ListProductsQuery['sort'],
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isPending, error, isPlaceholderData } = useProducts(query);

  /** Changing a filter goes back to page 1. */
  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === '' || value === ALL) next.delete(key);
        else next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );

  const columns = showCost ? 7 : 6;

  return (
    <div>
      <PageHeader
        title="สินค้า"
        description={data ? `ทั้งหมด ${data.total.toLocaleString('th-TH')} รายการ` : undefined}
        actions={
          user.can('product.create') && (
            <Button asChild>
              <Link to="/products/new">
                <Plus />
                เพิ่มสินค้า
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-3 flex flex-col gap-2">
        <SearchBox value={query.q ?? ''} onSearch={(text) => setParam('q', text)} />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="หมวดหมู่"
            value={params.get('categoryId') ?? ALL}
            onChange={(v) => setParam('categoryId', v)}
            options={[
              { value: ALL, label: 'ทุกหมวดหมู่' },
              ...(categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
          {tags && tags.length > 0 && (
            <FilterSelect
              label="แท็ก"
              value={params.get('tagId') ?? ALL}
              onChange={(v) => setParam('tagId', v)}
              options={[
                { value: ALL, label: 'ทุกแท็ก' },
                ...tags.map((t) => ({ value: String(t.id), label: t.name })),
              ]}
            />
          )}
          <FilterSelect
            label="สภาพสินค้า"
            value={params.get('condition') ?? ALL}
            onChange={(v) => setParam('condition', v)}
            options={[
              { value: ALL, label: 'ทุกสภาพ' },
              { value: 'new', label: PRODUCT_CONDITION_LABELS.new },
              { value: 'used', label: PRODUCT_CONDITION_LABELS.used },
            ]}
          />
          <FilterSelect
            label="สต็อก"
            value={params.get('stock') ?? ALL}
            onChange={(v) => setParam('stock', v)}
            options={STOCK_OPTIONS}
          />
          <FilterSelect
            label="สถานะ"
            value={query.status as string}
            onChange={(v) => setParam('status', v === 'active' ? undefined : v)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="การเรียง"
            value={query.sort as string}
            onChange={(v) => setParam('sort', v === 'name' ? undefined : v)}
            options={SORT_OPTIONS}
          />
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="discounted"
              checked={query.discounted === 'true'}
              onCheckedChange={(v) => setParam('discounted', v === true ? 'true' : undefined)}
            />
            <Label htmlFor="discounted">เฉพาะสินค้าลดราคา</Label>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'overflow-x-auto rounded-lg border bg-background transition-opacity',
          isPlaceholderData && 'opacity-60',
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>สินค้า</TableHead>
              <TableHead>หมวดหมู่</TableHead>
              <TableHead>แท็ก</TableHead>
              <TableHead>ราคาขาย</TableHead>
              {showCost && <TableHead className="text-right">ต้นทุนเฉลี่ย</TableHead>}
              <TableHead className="text-right">คงเหลือ</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={columns} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={columns} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                  ไม่พบสินค้าที่ตรงกับเงื่อนไข
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Link to={`/products/${product.id}`} className="flex items-center gap-3">
                    <ProductThumb url={product.thumbUrl} />
                    <div className="min-w-0">
                      <div className="max-w-80 truncate font-medium hover:underline">
                        {product.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {product.sku}
                        {product.brand && ` · ${product.brand}`}
                      </div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{product.categoryName}</TableCell>
                <TableCell>
                  {/* Price and stock columns already show these. */}
                  <ProductTags
                    product={product}
                    hide={['discount', 'awaitingPrice', 'stock']}
                    className="max-w-72"
                  />
                </TableCell>
                <TableCell>
                  <PriceTag
                    priceSatang={product.priceSatang}
                    regularPriceSatang={product.regularPriceSatang}
                  />
                </TableCell>
                {showCost && (
                  <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                    {formatMoney(product.costSatang)}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <StockText product={product} />
                </TableCell>
                <TableCell>
                  {product.archivedAt && <Badge variant="outline">ซ่อนอยู่</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <div className="mt-3">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPageChange={(next) => setParam('page', String(next))}
          />
        </div>
      )}
    </div>
  );
}
