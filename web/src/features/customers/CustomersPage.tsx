import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useFormat } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useCurrentUser } from '@/features/auth/queries';
import { CustomerDialog } from './CustomerDialog';
import { useCustomers } from './queries';

const PAGE_SIZE = 25;
const COLUMNS = 5;

export function CustomersPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const format = useFormat();
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q.trim(), 250);
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data, isPending, error, isPlaceholderData } = useCustomers({
    q: debouncedQ || undefined,
    includeArchived: showArchived ? 'true' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="ลูกค้า"
        description="ไม่ต้องเพิ่มลูกค้าทุกบิล ใช้เมื่ออยากเก็บประวัติการซื้อ ประกัน หรือการจัดส่ง"
        actions={
          user.can('customer.edit') && (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              เพิ่มลูกค้า
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่อ เบอร์โทร หรือ LINE"
            aria-label="ค้นหาลูกค้า"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="showArchived"
            checked={showArchived}
            onCheckedChange={(v) => {
              setShowArchived(v === true);
              setPage(1);
            }}
          />
          <Label htmlFor="showArchived">แสดงที่ซ่อนไว้</Label>
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
              <TableHead>ชื่อ</TableHead>
              <TableHead>เบอร์โทร</TableHead>
              <TableHead>LINE</TableHead>
              <TableHead className="text-right">ซื้อแล้ว</TableHead>
              <TableHead>ซื้อล่าสุด</TableHead>
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
                  {q ? 'ไม่พบลูกค้าที่ค้นหา' : 'ยังไม่มีลูกค้า'}
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((customer) => (
              <TableRow
                key={customer.id}
                className={cn('cursor-pointer', customer.archivedAt && 'text-muted-foreground')}
                onClick={() => navigate(`/customers/${customer.id}`)}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/customers/${customer.id}`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {customer.name}
                  </Link>
                  {customer.archivedAt && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      ซ่อนอยู่
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{customer.phone || '–'}</TableCell>
                <TableCell>{customer.lineId || '–'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {customer.saleCount > 0
                    ? `${customer.saleCount.toLocaleString('th-TH')} บิล`
                    : '–'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {format.date(customer.lastSaleAt)}
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
      {adding && (
        <CustomerDialog
          customer={null}
          onClose={() => setAdding(false)}
          onSaved={(saved) => navigate(`/customers/${saved.id}`)}
          onPickExisting={(id) => navigate(`/customers/${id}`)}
        />
      )}
    </div>
  );
}
