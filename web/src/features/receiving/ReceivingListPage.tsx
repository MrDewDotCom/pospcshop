import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PackagePlus, Search } from 'lucide-react';
import { cn } from 'cn';
import type { CostStatus } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useCurrentUser } from '@/features/auth/queries';
import { CostStatusBadge, VoidedBadge } from './CostStatusBadge';
import { useGoodsReceipts } from './queries';

const PAGE_SIZE = 25;
const ALL = 'all';

export function ReceivingListPage() {
  const user = useCurrentUser();
  const showCost = user.can('cost.view');
  const navigate = useNavigate();
  const format = useFormat();
  const [q, setQ] = useState('');
  const [costStatus, setCostStatus] = useState<CostStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const { data, isPending, error, isPlaceholderData } = useGoodsReceipts({
    q: q.trim() || undefined,
    costStatus: costStatus === ALL ? undefined : costStatus,
    page,
    pageSize: PAGE_SIZE,
  });
  const columns = showCost ? 7 : 6;

  return (
    <div>
      <PageHeader
        title="รับสินค้าเข้า"
        description="ใบรับสินค้าจากผู้จำหน่าย สต็อกเพิ่มทันทีเมื่อยืนยันการรับ"
        actions={
          user.can('goodsReceipt.create') && (
            <Button asChild>
              <Link to="/receiving/new">
                <PackagePlus />
                รับสินค้าเข้า
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
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="เลขที่เอกสาร เลขที่บิล หรือผู้จำหน่าย"
            aria-label="ค้นหาใบรับสินค้า"
            className="pl-9"
          />
        </div>
        <Select
          value={costStatus}
          onValueChange={(value) => {
            setCostStatus(value as CostStatus | typeof ALL);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="สถานะต้นทุน" className="w-full sm:w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
            <SelectItem value="unverified">รอตรวจสอบต้นทุน</SelectItem>
            <SelectItem value="verified">ตรวจสอบแล้ว</SelectItem>
          </SelectContent>
        </Select>
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
              <TableHead>เลขที่</TableHead>
              <TableHead>วันที่รับ</TableHead>
              <TableHead>ผู้จำหน่าย</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              {showCost && <TableHead className="text-right">ต้นทุนรวม</TableHead>}
              <TableHead>ผู้รับ</TableHead>
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
                  ยังไม่มีใบรับสินค้า
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((receipt) => (
              <TableRow
                key={receipt.id}
                className="cursor-pointer"
                onClick={() => navigate(`/receiving/${receipt.id}`)}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/receiving/${receipt.id}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {receipt.docNo}
                  </Link>
                  {receipt.supplierInvoiceNo && (
                    <div className="text-xs font-normal text-muted-foreground">
                      บิล {receipt.supplierInvoiceNo}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {format.dateTime(receipt.receivedAt)}
                </TableCell>
                <TableCell>{receipt.supplierName ?? '–'}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {receipt.totalQty.toLocaleString('th-TH')} ชิ้น
                  <div className="text-xs text-muted-foreground">{receipt.lineCount} รายการ</div>
                </TableCell>
                {showCost && (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(receipt.totalCostSatang)}
                  </TableCell>
                )}
                <TableCell>{receipt.createdByName ?? '–'}</TableCell>
                <TableCell>
                  {receipt.status === 'voided' ? (
                    <VoidedBadge />
                  ) : (
                    <CostStatusBadge status={receipt.costStatus} />
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
