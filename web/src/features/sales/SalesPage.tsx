import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search, ShoppingCart } from 'lucide-react';
import { cn } from 'cn';
import type { CheckoutPaymentMethod, SaleStatus } from '@pcshop/shared';
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
import { errorMessage } from '@/lib/api';
import { formatMoney, useFormat } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useCurrentUser } from '@/features/auth/queries';
import { useSales } from './queries';
import { PaymentMethodText, SaleStatusBadge } from './SaleBadges';

const PAGE_SIZE = 25;
const ALL = 'all';

export function SalesPage() {
  const user = useCurrentUser();
  const showProfit = user.can('cost.view');
  const navigate = useNavigate();
  const format = useFormat();
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q.trim(), 250);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<SaleStatus | typeof ALL>(ALL);
  const [method, setMethod] = useState<CheckoutPaymentMethod | typeof ALL>(ALL);
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isPending, error, isPlaceholderData } = useSales({
    q: debouncedQ || undefined,
    from: from || undefined,
    to: to || undefined,
    status: status === ALL ? undefined : status,
    paymentMethod: method === ALL ? undefined : method,
    mine: mine ? 'true' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const columns = showProfit ? 9 : 8;
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };

  return (
    <div>
      <PageHeader
        title="ประวัติการขาย"
        description="บิลขายทั้งหมด เปิดบิลเพื่อดู/ส่งใบเสร็จ รับคืนสินค้า หรือยกเลิกบิล"
        actions={
          user.can('sale.create') && (
            <Button asChild>
              <Link to="/pos">
                <ShoppingCart />
                ขายสินค้า
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(event) => resetPage(setQ)(event.target.value)}
            placeholder="เลขที่บิล ลูกค้า เบอร์โทร หรือซีเรียล"
            aria-label="ค้นหาบิลขาย"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(event) => resetPage(setFrom)(event.target.value)}
            aria-label="ตั้งแต่วันที่"
            className="w-auto"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => resetPage(setTo)(event.target.value)}
            aria-label="ถึงวันที่"
            className="w-auto"
          />
        </div>
        <Select value={status} onValueChange={(v) => resetPage(setStatus)(v as SaleStatus)}>
          <SelectTrigger aria-label="สถานะ" className="w-full sm:w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
            <SelectItem value="paid">ชำระแล้ว</SelectItem>
            <SelectItem value="voided">ยกเลิกแล้ว</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={method}
          onValueChange={(v) => resetPage(setMethod)(v as CheckoutPaymentMethod)}
        >
          <SelectTrigger aria-label="วิธีชำระ" className="w-full sm:w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกวิธีชำระ</SelectItem>
            <SelectItem value="cash">เงินสด</SelectItem>
            <SelectItem value="transfer">โอน/พร้อมเพย์</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="mine"
            checked={mine}
            onCheckedChange={(v) => resetPage(setMine)(v === true)}
          />
          <Label htmlFor="mine">เฉพาะบิลที่ฉันขาย</Label>
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
              <TableHead>เลขที่บิล</TableHead>
              <TableHead>วันเวลา</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
              {showProfit && <TableHead className="text-right">กำไร</TableHead>}
              <TableHead>ชำระโดย</TableHead>
              <TableHead>พนักงานขาย</TableHead>
              <TableHead>สถานะ</TableHead>
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
                  ไม่พบบิลขาย
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((sale) => (
              <TableRow
                key={sale.id}
                className={cn(
                  'cursor-pointer',
                  sale.status === 'voided' && 'text-muted-foreground',
                )}
                onClick={() => navigate(`/sales/${sale.id}`)}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/sales/${sale.id}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {sale.docNo}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{format.dateTime(sale.soldAt)}</TableCell>
                <TableCell>
                  {sale.customerName || <span className="text-muted-foreground">ลูกค้าทั่วไป</span>}
                  {sale.customerPhone && (
                    <div className="text-xs text-muted-foreground">{sale.customerPhone}</div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {sale.itemCount.toLocaleString('th-TH')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={cn(sale.status === 'voided' && 'line-through')}>
                    {formatMoney(sale.totalSatang)}
                  </span>
                  {sale.refundedSatang > 0 && (
                    <div className="text-xs text-muted-foreground">
                      คืนเงิน {formatMoney(sale.refundedSatang)}
                    </div>
                  )}
                </TableCell>
                {showProfit && (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(sale.profitSatang)}
                  </TableCell>
                )}
                <TableCell>
                  <PaymentMethodText method={sale.paymentMethod} />
                </TableCell>
                <TableCell>{sale.salespersonName ?? '–'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <SaleStatusBadge status={sale.status} />
                  {sale.returnCount > 0 && (
                    <Badge variant="outline" className="ml-1">
                      มีการคืน
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <div className="mt-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
