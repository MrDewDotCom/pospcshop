import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Pencil } from 'lucide-react';
import { REFUND_METHOD_LABELS } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { formatMoney, useFormat } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useCurrentUser } from '@/features/auth/queries';
import { PaymentMethodText, SaleStatusBadge } from '@/features/sales/SaleBadges';
import { CustomerDialog } from './CustomerDialog';
import { useArchiveCustomer, useCustomer, useCustomerHistory } from './queries';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{children}</dd>
    </div>
  );
}

function CustomerSales({ id }: { id: number }) {
  const user = useCurrentUser();
  const showProfit = user.can('cost.view');
  const navigate = useNavigate();
  const format = useFormat();
  const { data, isPending, error } = useCustomerHistory(id);
  const columns = showProfit ? 7 : 6;

  return (
    <>
      <h2 className="mt-6 mb-2 text-lg font-semibold">ประวัติการซื้อ</h2>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่บิล</TableHead>
              <TableHead>วันที่</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
              {showProfit && <TableHead className="text-right">กำไร</TableHead>}
              <TableHead>ชำระโดย</TableHead>
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
            {data?.sales.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns} className="py-6 text-center text-muted-foreground">
                  ยังไม่มีประวัติการซื้อ
                </TableCell>
              </TableRow>
            )}
            {data?.sales.map((sale) => (
              <TableRow
                key={sale.id}
                className="cursor-pointer"
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
                <TableCell className="text-right tabular-nums">
                  {sale.itemCount.toLocaleString('th-TH')} ชิ้น
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(sale.totalSatang)}
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
                <TableCell>
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

      {data && data.returns.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">การคืนสินค้า</h2>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ใบคืน</TableHead>
                  <TableHead>วันที่</TableHead>
                  <TableHead>บิลขาย</TableHead>
                  <TableHead>เหตุผล</TableHead>
                  <TableHead className="text-right">คืนเงิน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.returns.map((ret) => (
                  <TableRow
                    key={ret.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/returns/${ret.id}`)}
                  >
                    <TableCell className="font-medium">
                      {ret.docNo}
                      {ret.pendingCount > 0 && (
                        <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-900">
                          รอตรวจสอบ {ret.pendingCount}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format.dateTime(ret.returnedAt)}
                    </TableCell>
                    <TableCell>{ret.saleDocNo}</TableCell>
                    <TableCell className="max-w-64 truncate">{ret.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ret.refundMethod === 'none' ? (
                        REFUND_METHOD_LABELS.none
                      ) : (
                        <>
                          {formatMoney(ret.refundSatang)}
                          <div className="text-xs text-muted-foreground">
                            {REFUND_METHOD_LABELS[ret.refundMethod]}
                          </div>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}

export function CustomerDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const user = useCurrentUser();
  const format = useFormat();
  const { data: customer, isPending, error } = useCustomer(id);
  const archive = useArchiveCustomer();
  const [editing, setEditing] = useState(false);
  useDocumentTitle(customer ? `ลูกค้า ${customer.name}` : undefined);

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !customer) return <p className="text-destructive">{errorMessage(error)}</p>;

  const toggleArchived = () =>
    archive.mutate(
      { id: customer.id, archived: !customer.archivedAt },
      {
        onSuccess: () => toast.success(customer.archivedAt ? 'แสดงลูกค้าแล้ว' : 'ซ่อนลูกค้าแล้ว'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/customers">
          <ArrowLeft />
          รายชื่อลูกค้า
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          {customer.archivedAt && <Badge variant="outline">ซ่อนอยู่</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {user.can('customer.archive') && (
            <Button variant="outline" onClick={toggleArchived} disabled={archive.isPending}>
              {customer.archivedAt ? <Eye /> : <EyeOff />}
              {customer.archivedAt ? 'แสดงลูกค้า' : 'ซ่อนลูกค้า'}
            </Button>
          )}
          {user.can('customer.edit') && (
            <Button onClick={() => setEditing(true)}>
              <Pencil />
              แก้ไข
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="เบอร์โทร">{customer.phone || '–'}</Info>
            <Info label="LINE ID">{customer.lineId || '–'}</Info>
            <Info label="ซื้อแล้ว">
              {customer.saleCount > 0 ? `${customer.saleCount.toLocaleString('th-TH')} บิล` : '–'}
            </Info>
            <Info label="เป็นลูกค้าตั้งแต่">{format.date(customer.createdAt)}</Info>
            {customer.address && (
              <div className="col-span-2">
                <Info label="ที่อยู่">{customer.address}</Info>
              </div>
            )}
            {customer.notes && (
              <div className="col-span-2">
                <Info label="หมายเหตุ">{customer.notes}</Info>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <CustomerSales id={customer.id} />

      {editing && (
        <CustomerDialog
          customer={customer}
          onClose={() => setEditing(false)}
          onPickExisting={(otherId) => {
            setEditing(false);
            navigate(`/customers/${otherId}`);
          }}
        />
      )}
    </div>
  );
}
