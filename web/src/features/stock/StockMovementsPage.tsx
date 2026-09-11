import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CircleAlert, CircleCheck, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { cn } from 'cn';
import {
  STOCK_MOVEMENT_TYPES,
  STOCK_MOVEMENT_TYPE_LABELS,
  type StockMovementType,
} from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormAlert } from '@/components/FormAlert';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { useFormat } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/queries';
import { useProduct } from '@/features/products/queries';
import { MovementTable } from './MovementTable';
import { useStockIntegrity, useStockMovements } from './queries';

const PAGE_SIZE = 30;
const ALL = 'all';
// Only the types that can happen in Phase 1 are worth filtering by today; the rest arrive later.
const FILTER_TYPES = STOCK_MOVEMENT_TYPES.filter((t) =>
  ['receive', 'adjustment', 'void', 'sale', 'return_restock', 'opening'].includes(t),
);

function IntegrityCheck() {
  const check = useStockIntegrity();
  const format = useFormat();
  const report = check.data;
  return (
    <div className="mb-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">ตรวจสอบความถูกต้องของสต็อก</div>
          <p className="text-sm text-muted-foreground">
            เทียบยอดคงเหลือของทุกสินค้ากับประวัติการเคลื่อนไหวและซีเรียล
          </p>
        </div>
        <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
          <ShieldCheck />
          {check.isPending ? 'กำลังตรวจสอบ…' : 'ตรวจสอบตอนนี้'}
        </Button>
      </div>
      <FormAlert error={check.error} />
      {report?.ok && (
        <p className="mt-3 flex items-center gap-2 text-sm text-green-700">
          <CircleCheck className="size-4" />
          ถูกต้องทั้งหมด ({report.productCount.toLocaleString('th-TH')} สินค้า) ·{' '}
          {format.dateTime(report.checkedAt)}
        </p>
      )}
      {report && !report.ok && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium text-destructive">
            <CircleAlert className="size-4" />
            พบสินค้าที่ยอดไม่ตรง {report.mismatches.length} รายการ กรุณาแจ้งผู้ดูแลระบบ
          </p>
          <ul className="list-inside list-disc">
            {report.mismatches.map((m) => (
              <li key={m.productId}>
                <Link to={`/products/${m.productId}`} className="hover:underline">
                  {m.name} ({m.sku})
                </Link>
                : คงเหลือ {m.onHand} · ตามประวัติ {m.ledgerSum}
                {m.inStockSerials !== null && ` · ซีเรียลพร้อมขาย ${m.inStockSerials}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function StockMovementsPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const productId = Number(params.get('productId')) || undefined;
  const type = (params.get('type') as StockMovementType | null) ?? undefined;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const [docText, setDocText] = useState(q);

  const { data: product } = useProduct(productId ?? 0);
  const { data, isPending, error, isPlaceholderData } = useStockMovements({
    productId,
    type,
    from: from || undefined,
    to: to || undefined,
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === ALL) next.delete(key);
        else next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );

  return (
    <div>
      <PageHeader
        title="ความเคลื่อนไหวสต็อก"
        description="ทุกครั้งที่สต็อกเพิ่มหรือลด ระบบบันทึกไว้ที่นี่ แก้ไขหรือลบไม่ได้"
        actions={
          user.can('stock.adjust') && (
            <Button variant="outline" asChild>
              <Link to="/stock/adjust">
                <SlidersHorizontal />
                ปรับสต็อก
              </Link>
            </Button>
          )
        }
      />
      {user.can('stock.checkIntegrity') && <IntegrityCheck />}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        {productId && (
          <div className="flex items-center gap-1 rounded-md border bg-background py-1 pr-1 pl-3 text-sm">
            สินค้า: <span className="font-medium">{product?.name ?? '…'}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="ดูทุกสินค้า"
              onClick={() => setParam('productId', undefined)}
            >
              <X />
            </Button>
          </div>
        )}
        <Select value={type ?? ALL} onValueChange={(v) => setParam('type', v)}>
          <SelectTrigger aria-label="ประเภท" className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกประเภท</SelectItem>
            {FILTER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {STOCK_MOVEMENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            ตั้งแต่วันที่
          </Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setParam('from', e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            ถึงวันที่
          </Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setParam('to', e.target.value)}
            className="w-40"
          />
        </div>
        <Input
          type="search"
          value={docText}
          onChange={(e) => setDocText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setParam('q', docText.trim())}
          onBlur={() => setParam('q', docText.trim())}
          placeholder="เลขที่เอกสาร เช่น GR, AJ"
          aria-label="ค้นหาเลขที่เอกสาร"
          className="w-full sm:w-52"
        />
      </div>

      <div
        className={cn(
          'overflow-x-auto rounded-lg border bg-background transition-opacity',
          isPlaceholderData && 'opacity-60',
        )}
      >
        <MovementTable
          items={data?.items}
          isPending={isPending}
          error={error}
          showProduct={!productId}
          showCost={user.can('cost.view')}
          emptyText="ไม่พบความเคลื่อนไหวตามเงื่อนไข"
        />
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
