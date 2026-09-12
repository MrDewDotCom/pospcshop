import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ImageOff,
  Pencil,
  SlidersHorizontal,
  Tag,
  Tags,
} from 'lucide-react';
import { cn } from 'cn';
import {
  SERIAL_STATUS_LABELS,
  formatSpecs,
  formatWarranty,
  formatWarrantyPeriod,
  unitSavingsSatang,
  type Product,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PriceTag } from '@/components/PriceTag';
import { ProductTags } from '@/components/ProductTags';
import { errorMessage } from '@/lib/api';
import { formatMoney, useFormat } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useCurrentUser } from '@/features/auth/queries';
import { MovementTable } from '@/features/stock/MovementTable';
import { useProductSerials, useStockMovements } from '@/features/stock/queries';
import { PricingDialog } from './PricingDialog';
import { ProductTagsDialog } from './ProductTagsDialog';
import { StockText } from './ProductsPage';
import { useArchiveProduct, usePriceHistory, useProduct } from './queries';

function Gallery({ product }: { product: Product }) {
  const [selected, setSelected] = useState(0);
  const image = product.images[selected] ?? product.images[0];
  if (!image) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <div className="flex flex-col items-center gap-2 text-sm">
          <ImageOff className="size-8" />
          ยังไม่มีรูปสินค้า
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <a href={image.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={image.url}
          alt={product.name}
          className="aspect-square w-full rounded-lg border bg-background object-contain"
        />
      </a>
      {product.images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {product.images.map((img, index) => (
            <button
              key={img.fileId}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`รูปที่ ${index + 1}`}
              className={cn(
                'aspect-square overflow-hidden rounded-md border',
                index === selected && 'ring-2 ring-primary',
              )}
            >
              <img src={img.thumbUrl} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function PriceHistoryCard({ productId }: { productId: number }) {
  const { data } = usePriceHistory(productId);
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle>ประวัติราคา</CardTitle>
      </CardHeader>
      <CardContent>
        {data?.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่เคยตั้งราคา</p>}
        <ul className="flex flex-col divide-y">
          {data?.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <PriceTag
                priceSatang={entry.priceSatang}
                regularPriceSatang={entry.regularPriceSatang}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">
                {format.dateTime(entry.changedAt)}
                {entry.changedByName && ` · ${entry.changedByName}`}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SerialsCard({ productId }: { productId: number }) {
  const { data: units, isPending } = useProductSerials(productId);
  const format = useFormat();
  const [showAll, setShowAll] = useState(false);
  const inStock = units?.filter((u) => u.status === 'in_stock') ?? [];
  const visible = showAll ? (units ?? []) : inStock;
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>ซีเรียล · พร้อมขาย {inStock.length} ชิ้น</CardTitle>
        {units && units.length > inStock.length && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'แสดงเฉพาะที่พร้อมขาย' : `แสดงทั้งหมด (${units.length})`}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isPending && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
        {units && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">ไม่มีชิ้นที่พร้อมขาย</p>
        )}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((unit) => (
            <li key={unit.id} className="flex flex-col gap-1 rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-sm">{unit.serialNo}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    unit.status === 'in_stock'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {SERIAL_STATUS_LABELS[unit.status]}
                </Badge>
                {unit.wasReturned && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    เคยถูกคืน
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                รับเข้า {format.date(unit.receivedAt)}
                {unit.supplierWarrantyExpiresAt &&
                  ` · ประกันผู้จำหน่ายถึง ${format.date(unit.supplierWarrantyExpiresAt)}`}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RecentMovementsCard({ productId }: { productId: number }) {
  const user = useCurrentUser();
  const { data, isPending, error } = useStockMovements({ productId, pageSize: 10 });
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>ความเคลื่อนไหวสต็อกล่าสุด</CardTitle>
        {data && data.total > data.items.length && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/stock/movements?productId=${productId}`}>
              ดูทั้งหมด ({data.total.toLocaleString('th-TH')})
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <MovementTable
          items={data?.items}
          isPending={isPending}
          error={error}
          showProduct={false}
          showCost={user.can('cost.view')}
        />
      </CardContent>
    </Card>
  );
}

function ArchiveButton({ product }: { product: Product }) {
  const archive = useArchiveProduct();
  const archived = !!product.archivedAt;
  const run = () =>
    archive.mutate(
      { id: product.id, archived: !archived },
      {
        onSuccess: () => toast.success(archived ? 'แสดงสินค้าอีกครั้งแล้ว' : 'ซ่อนสินค้าแล้ว'),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  if (archived) {
    return (
      <Button variant="outline" onClick={run} disabled={archive.isPending}>
        <Eye />
        แสดงสินค้าอีกครั้ง
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={archive.isPending}>
          <EyeOff />
          ซ่อนสินค้า
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ซ่อนสินค้านี้?</AlertDialogTitle>
          <AlertDialogDescription>
            สินค้าจะไม่แสดงในรายการและค้นหาไม่เจอตอนขาย แต่ประวัติเดิมยังอยู่ครบ
            และแสดงอีกครั้งได้ภายหลัง (ซ่อนได้เฉพาะสินค้าที่คงเหลือเป็น 0)
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction onClick={run}>ซ่อนสินค้า</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProductDetailPage() {
  const id = Number(useParams().id);
  const user = useCurrentUser();
  const { data: product, isPending, error } = useProduct(id);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  useDocumentTitle(product?.name);

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !product) return <p className="text-destructive">{errorMessage(error)}</p>;

  const specs = formatSpecs(product.categoryKind, product.specs);
  const savings = unitSavingsSatang(product);

  return (
    <div className="max-w-6xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/products">
          <ArrowLeft />
          รายการสินค้า
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{product.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>{product.sku}</span>
            {product.brand && <span>· {product.brand}</span>}
            <span>· {product.categoryName}</span>
            {product.archivedAt && <Badge variant="destructive">ซ่อนอยู่</Badge>}
          </div>
          {/* Discount and "awaiting price" are already shown by the PriceTag below. */}
          <ProductTags product={product} hide={['discount', 'awaitingPrice']} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2">
          {user.can('product.editDetails') && (
            <Button variant="outline" asChild>
              <Link to={`/products/${product.id}/edit`}>
                <Pencil />
                แก้ไข
              </Link>
            </Button>
          )}
          {user.can('tag.manage') && (
            <Button variant="outline" onClick={() => setTagsOpen(true)}>
              <Tags />
              แท็ก
            </Button>
          )}
          {user.can('product.editPricing') && (
            <Button onClick={() => setPricingOpen(true)}>
              <Tag />
              ตั้งราคา
            </Button>
          )}
          {user.can('stock.adjust') && product.trackStock && !product.archivedAt && (
            <Button variant="outline" asChild>
              <Link to={`/stock/adjust?productId=${product.id}`}>
                <SlidersHorizontal />
                ปรับสต็อก
              </Link>
            </Button>
          )}
          {user.can('product.archive') && <ArchiveButton product={product} />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-4">
          <Gallery key={product.images.map((i) => i.fileId).join()} product={product} />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div>
                <div className="text-xs text-muted-foreground">ราคาขาย</div>
                <PriceTag
                  priceSatang={product.priceSatang}
                  regularPriceSatang={product.regularPriceSatang}
                  size="lg"
                />
                {product.priceSatang === null && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    ยังขายไม่ได้จนกว่าเจ้าของร้านจะตั้งราคา
                  </p>
                )}
                {savings > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    ลูกค้าประหยัด {formatMoney(savings)} ต่อชิ้น
                  </p>
                )}
              </div>
              <dl className="divide-y border-t">
                <InfoRow label="คงเหลือ">
                  <StockText product={product} />
                </InfoRow>
                {product.trackStock && (
                  <InfoRow label="แจ้งเตือนเมื่อเหลือไม่เกิน">{product.minStock} ชิ้น</InfoRow>
                )}
                <InfoRow label="การรับประกัน">
                  {formatWarranty(product.warrantyType, product.warrantyMonths)}
                </InfoRow>
                <InfoRow label="ประกันจากผู้จำหน่าย">
                  {product.supplierWarrantyMonths > 0
                    ? formatWarrantyPeriod(product.supplierWarrantyMonths)
                    : 'ไม่มี'}
                </InfoRow>
                <InfoRow label="บาร์โค้ด">{product.barcode ?? '–'}</InfoRow>
                <InfoRow label="ซีเรียล (S/N)">
                  {product.serialRequired ? 'บังคับบันทึกทุกชิ้น' : 'ไม่บังคับ'}
                </InfoRow>
                {user.can('cost.view') && product.costSatang !== undefined && (
                  <InfoRow label="ต้นทุนเฉลี่ย (เห็นเฉพาะเจ้าของร้าน)">
                    <span className="tabular-nums">{formatMoney(product.costSatang)}</span>
                  </InfoRow>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>สเปก</CardTitle>
            </CardHeader>
            <CardContent>
              {specs.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่ได้กรอกสเปก</p>
              ) : (
                <dl className="divide-y">
                  {specs.map((line) => (
                    <InfoRow key={line.key} label={line.label}>
                      {line.value}
                    </InfoRow>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          {(product.description || product.notes) && (
            <Card>
              <CardHeader>
                <CardTitle>รายละเอียด</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {product.description && (
                  <p className="whitespace-pre-line">{product.description}</p>
                )}
                {product.notes && (
                  <div className="rounded-md bg-muted px-3 py-2">
                    <div className="text-xs text-muted-foreground">หมายเหตุภายในร้าน</div>
                    <p className="whitespace-pre-line">{product.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <PriceHistoryCard productId={product.id} />
        </div>
      </div>

      {product.serialRequired && <SerialsCard productId={product.id} />}
      {product.trackStock && <RecentMovementsCard productId={product.id} />}

      {pricingOpen && <PricingDialog product={product} onClose={() => setPricingOpen(false)} />}
      {tagsOpen && <ProductTagsDialog product={product} onClose={() => setTagsOpen(false)} />}
    </div>
  );
}
