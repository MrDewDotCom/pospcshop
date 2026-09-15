import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronRight,
  ClipboardCheck,
  PackagePlus,
  ScanSearch,
  ShoppingCart,
  Tag,
  Undo2,
} from 'lucide-react';
import { cn } from 'cn';
import { ROLE_LABELS, formatThaiDate, type DashboardSummary } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useCurrentUser } from '@/features/auth/queries';
import { useShopSettings } from '@/features/settings/queries';
// Recharts is only needed by the owner's chart, so it loads on demand.
const DailySalesChart = lazy(() =>
  import('./DailySalesChart').then((m) => ({ default: m.DailySalesChart })),
);
import {
  presetRange,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  useDashboard,
  type RangePreset,
} from './queries';

/** Something waiting for a decision (e.g. costs to verify, returned units to check). */
function TodoLink({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100"
    >
      <Icon className="size-5 shrink-0" />
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-4" />
    </Link>
  );
}

/** A headline number. Big values use proportional figures (tabular only in columns). */
function StatTile({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn('font-semibold', emphasis ? 'text-3xl' : 'text-2xl')}>{value}</div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </CardContent>
    </Card>
  );
}

function LowStockCard({ summary }: { summary: DashboardSummary }) {
  const empty = summary.lowStock.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>สินค้าใกล้หมด</CardTitle>
        <CardDescription>
          หมด {summary.outOfStockCount.toLocaleString('th-TH')} · ใกล้หมด{' '}
          {summary.lowStockCount.toLocaleString('th-TH')} รายการ
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">สต็อกเพียงพอทุกรายการ</p>
        ) : (
          <ul className="divide-y text-sm">
            {summary.lowStock.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                <Link to={`/products/${item.id}`} className="min-w-0 truncate hover:underline">
                  {item.name}
                </Link>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    item.onHand <= 0 ? 'font-medium text-destructive' : 'text-amber-700',
                  )}
                >
                  {item.onHand <= 0
                    ? 'หมด'
                    : `เหลือ ${item.onHand.toLocaleString('th-TH')} (ขั้นต่ำ ${item.minStock})`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!empty && (
          <div className="mt-2 flex gap-3 text-sm">
            <Link to="/products?stock=out" className="text-primary hover:underline">
              ดูสินค้าที่หมด
            </Link>
            <Link to="/products?stock=low" className="text-primary hover:underline">
              ดูสินค้าใกล้หมด
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BestSellersCard({ summary }: { summary: DashboardSummary }) {
  const items = summary.bestSellers ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>สินค้าขายดี</CardTitle>
        <CardDescription>จำนวนชิ้นหักรายการที่ลูกค้าคืน ในช่วงที่เลือก</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มียอดขายในช่วงนี้</p>
        ) : (
          <ol className="divide-y text-sm">
            {items.map((item, index) => (
              <li key={item.productId} className="flex items-center gap-3 py-1.5">
                <span className="w-4 text-muted-foreground tabular-nums">{index + 1}</span>
                <Link
                  to={`/products/${item.productId}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {item.name}
                </Link>
                <span className="shrink-0 tabular-nums">
                  {item.qty.toLocaleString('th-TH')} ชิ้น
                </span>
                <span className="w-24 shrink-0 text-right text-muted-foreground tabular-nums">
                  {formatMoney(item.revenueSatang)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function PendingReturnsTodo({ summary }: { summary: DashboardSummary }) {
  if (summary.pendingReturnUnits === 0) return null;
  return (
    <TodoLink to="/returns" icon={Undo2}>
      มีสินค้าคืนรอตรวจสอบ{' '}
      <span className="font-semibold">{summary.pendingReturnUnits.toLocaleString('th-TH')}</span>{' '}
      ชิ้น ({summary.pendingReturnDocs.toLocaleString('th-TH')} ใบคืน) เลือกคืนเข้าสต็อก ส่งเคลม
      หรือตัดจำหน่าย
    </TodoLink>
  );
}

/** Date range: presets first, then a custom range (one row, above everything it scopes). */
function RangeBar({
  preset,
  range,
  onPreset,
  onCustom,
}: {
  preset: RangePreset | 'custom';
  range: { from: string; to: string };
  onPreset: (preset: RangePreset) => void;
  onCustom: (range: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-md border bg-background p-0.5">
        {RANGE_PRESETS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? 'secondary' : 'ghost'}
            onClick={() => onPreset(p)}
          >
            {RANGE_PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={range.from}
          max={range.to}
          onChange={(event) =>
            event.target.value && onCustom({ ...range, from: event.target.value })
          }
          aria-label="ตั้งแต่วันที่"
          className="h-8 w-auto"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          value={range.to}
          min={range.from}
          onChange={(event) => event.target.value && onCustom({ ...range, to: event.target.value })}
          aria-label="ถึงวันที่"
          className="h-8 w-auto"
        />
      </div>
    </div>
  );
}

function OwnerDashboard() {
  const { data: settings } = useShopSettings();
  const buddhistEra = settings?.useBuddhistEra ?? true;
  const [preset, setPreset] = useState<RangePreset | 'custom'>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const { data: summary, error, isPlaceholderData } = useDashboard(range);

  return (
    <>
      <RangeBar
        preset={preset}
        range={range}
        onPreset={(p) => {
          setPreset(p);
          setRange(presetRange(p));
        }}
        onCustom={(next) => {
          setPreset('custom');
          setRange(next);
        }}
      />
      {error && <p className="text-destructive">{errorMessage(error)}</p>}
      {summary && (
        <div
          className={cn(
            'flex flex-col gap-4 transition-opacity',
            isPlaceholderData && 'opacity-60',
          )}
        >
          <div className="flex flex-col gap-2">
            {!!summary.unverifiedReceiptCount && (
              <TodoLink to="/receiving?costStatus=unverified" icon={ClipboardCheck}>
                มีใบรับสินค้ารอตรวจสอบต้นทุน{' '}
                <span className="font-semibold">{summary.unverifiedReceiptCount}</span> ใบ
              </TodoLink>
            )}
            {!!summary.awaitingPriceCount && (
              <TodoLink to="/products?status=awaitingPrice" icon={Tag}>
                มีสินค้ารอตั้งราคา{' '}
                <span className="font-semibold">{summary.awaitingPriceCount}</span> รายการ
                ยังขายไม่ได้จนกว่าจะตั้งราคา
              </TodoLink>
            )}
            <PendingReturnsTodo summary={summary} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="ยอดขายสุทธิ"
              emphasis
              value={formatMoney(summary.netSalesSatang)}
              detail={
                summary.refundTotalSatang
                  ? `ขาย ${formatMoney(summary.grossSalesSatang)} · คืนเงิน ${formatMoney(summary.refundTotalSatang)}`
                  : 'ไม่มีการคืนเงิน'
              }
            />
            <StatTile
              label="กำไร"
              value={formatMoney(summary.profitSatang)}
              detail="ยอดขายสุทธิ − ต้นทุนสินค้าที่ขาย"
            />
            <StatTile
              label="จำนวนบิล"
              value={summary.saleCount.toLocaleString('th-TH')}
              detail={`${summary.itemCount.toLocaleString('th-TH')} ชิ้น${
                summary.returnedUnitCount
                  ? ` · คืน ${summary.returnedUnitCount.toLocaleString('th-TH')} ชิ้น`
                  : ''
              }`}
            />
            <StatTile
              label="มูลค่าสต็อก (ตอนนี้)"
              value={formatMoney(summary.inventoryValueSatang)}
              detail="จำนวนคงเหลือ × ต้นทุนเฉลี่ย"
            />
          </div>

          {summary.daily && summary.daily.length > 1 && (
            <Suspense fallback={<div className="h-80 rounded-xl border bg-background" />}>
              <DailySalesChart daily={summary.daily} buddhistEra={buddhistEra} />
            </Suspense>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <BestSellersCard summary={summary} />
            <LowStockCard summary={summary} />
          </div>
        </div>
      )}
    </>
  );
}

const STAFF_SHORTCUTS = [
  { to: '/pos', label: 'ขายสินค้า', icon: ShoppingCart },
  { to: '/stock/lookup', label: 'เช็คสต็อก', icon: ScanSearch },
  { to: '/receiving/new', label: 'รับสินค้าเข้า', icon: PackagePlus },
];

/** Q13: staff see activity only — their own sales today, stock, and returns to check. No money. */
function StaffDashboard() {
  const [range] = useState(() => presetRange('today'));
  const { data: summary, error } = useDashboard(range);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {STAFF_SHORTCUTS.map((item) => (
          <Button key={item.to} asChild variant="outline" className="h-14 justify-start text-base">
            <Link to={item.to}>
              <item.icon />
              {item.label}
            </Link>
          </Button>
        ))}
      </div>
      {error && <p className="text-destructive">{errorMessage(error)}</p>}
      {summary && (
        <>
          <PendingReturnsTodo summary={summary} />
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="บิลที่ฉันขายวันนี้"
              emphasis
              value={summary.mySaleCount.toLocaleString('th-TH')}
              detail={`${summary.myItemCount.toLocaleString('th-TH')} ชิ้น`}
            />
            <StatTile
              label="บิลทั้งร้านวันนี้"
              value={summary.saleCount.toLocaleString('th-TH')}
              detail={`${summary.itemCount.toLocaleString('th-TH')} ชิ้น`}
            />
            <StatTile
              label="สินค้าคืนรอตรวจสอบ"
              value={summary.pendingReturnUnits.toLocaleString('th-TH')}
              detail="ชิ้น"
            />
          </div>
          <LowStockCard summary={summary} />
        </>
      )}
    </>
  );
}

export function HomePage() {
  useDocumentTitle('หน้าแรก');
  const user = useCurrentUser();
  const [today] = useState(() => formatThaiDate(Date.now(), { month: 'long' }));

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">สวัสดี, {user.name}</h1>
        <p className="text-muted-foreground">
          {ROLE_LABELS[user.role]} · {today}
        </p>
      </div>
      {user.can('revenue.view') ? <OwnerDashboard /> : <StaffDashboard />}
    </div>
  );
}
