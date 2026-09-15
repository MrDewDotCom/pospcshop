import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { cn } from 'cn';
import { REFUND_METHOD_LABELS } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useReturns } from './queries';

const PAGE_SIZE = 25;
const COLUMNS = 7;

export function ReturnsPage() {
  const navigate = useNavigate();
  const format = useFormat();
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q.trim(), 250);
  // In the URL so the dashboard can link to "waiting for a decision".
  const [params, setParams] = useSearchParams();
  const pendingOnly = params.get('all') === null;
  const [page, setPage] = useState(1);
  const { data, isPending, error, isPlaceholderData } = useReturns({
    q: debouncedQ || undefined,
    pending: pendingOnly ? 'true' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="สินค้าคืน"
        description="สินค้าที่ลูกค้านำมาคืนจะรอตรวจสอบก่อน แล้วเลือกว่าจะคืนเข้าสต็อก ส่งเคลม หรือตัดจำหน่าย รับคืนได้จากหน้าบิลขาย"
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="เลขที่ใบคืน บิลขาย ลูกค้า หรือซีเรียล"
            aria-label="ค้นหาใบคืนสินค้า"
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border bg-background p-0.5">
          {[
            [true, 'รอตรวจสอบ'],
            [false, 'ทั้งหมด'],
          ].map(([value, label]) => (
            <Button
              key={String(value)}
              size="sm"
              variant={pendingOnly === value ? 'secondary' : 'ghost'}
              onClick={() => {
                setParams(value ? {} : { all: '1' }, { replace: true });
                setPage(1);
              }}
            >
              {label}
            </Button>
          ))}
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
              <TableHead>เลขที่ใบคืน</TableHead>
              <TableHead>วันเวลา</TableHead>
              <TableHead>บิลขาย</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead>เหตุผล</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead className="text-right">คืนเงิน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="py-8 text-center text-muted-foreground">
                  {pendingOnly ? 'ไม่มีสินค้าคืนที่รอตรวจสอบ' : 'ยังไม่มีการคืนสินค้า'}
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((ret) => (
              <TableRow
                key={ret.id}
                className="cursor-pointer"
                onClick={() => navigate(`/returns/${ret.id}`)}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  <Link
                    to={`/returns/${ret.id}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {ret.docNo}
                  </Link>
                  {ret.pendingCount > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-900">
                      รอตรวจสอบ {ret.pendingCount}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {format.dateTime(ret.returnedAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{ret.saleDocNo}</TableCell>
                <TableCell>
                  {ret.customerName || <span className="text-muted-foreground">ลูกค้าทั่วไป</span>}
                </TableCell>
                <TableCell className="max-w-56 truncate">{ret.reason}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {ret.itemCount.toLocaleString('th-TH')}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {ret.refundMethod === 'none' ? (
                    <span className="text-muted-foreground">{REFUND_METHOD_LABELS.none}</span>
                  ) : (
                    formatMoney(ret.refundSatang)
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
