import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import {
  addBangkokMonths,
  formatWarranty,
  PAYMENT_METHOD_LABELS,
  REFUND_METHOD_LABELS,
  type Sale,
  type SaleLine,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DiscountBadge } from '@/components/PriceTag';
import { errorMessage } from '@/lib/api';
import { formatMoney, useFormat } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useCurrentUser } from '@/features/auth/queries';
import { useSale } from './queries';
import { ReceiptDialog } from './ReceiptDialog';
import { SaleStatusBadge } from './SaleBadges';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function LineSerials({ line }: { line: SaleLine }) {
  const format = useFormat();
  if (line.serials.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {line.serials.map((serial) => (
        <Badge
          key={serial.id}
          variant="outline"
          className={serial.returned ? 'font-mono font-normal opacity-60' : 'font-mono font-normal'}
          title={
            serial.warrantyExpiresAt
              ? `ประกันร้านถึง ${format.date(serial.warrantyExpiresAt)}`
              : undefined
          }
        >
          {serial.serialNo}
          {serial.returned && ' · คืนแล้ว'}
        </Badge>
      ))}
    </div>
  );
}

function SaleLines({ sale, showCost }: { sale: Sale; showCost: boolean }) {
  const format = useFormat();
  const netSatang = sale.totalSatang - sale.refundedSatang;
  const warrantyEnd = (line: SaleLine) =>
    line.warrantyType !== 'none' && line.warrantyMonths > 0
      ? new Date(addBangkokMonths(Date.parse(sale.soldAt), line.warrantyMonths)).toISOString()
      : null;

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>สินค้า</TableHead>
            <TableHead className="text-right">ราคา/ชิ้น</TableHead>
            <TableHead className="text-right">จำนวน</TableHead>
            <TableHead className="text-right">รวม</TableHead>
            {showCost && <TableHead className="text-right">ต้นทุน/ชิ้น</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sale.lines.map((line) => {
            const end = warrantyEnd(line);
            return (
              <TableRow key={line.id}>
                <TableCell className="align-top whitespace-normal">
                  {line.productId ? (
                    <Link
                      to={`/products/${line.productId}`}
                      className="font-medium hover:underline"
                    >
                      {line.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{line.name}</span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {line.sku} · {formatWarranty(line.warrantyType, line.warrantyMonths)}
                    {end && ` (ถึง ${format.date(end)})`}
                  </div>
                  <LineSerials line={line} />
                </TableCell>
                <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                  {formatMoney(line.unitPriceSatang)}
                  {line.regularPriceSatang !== null && (
                    <div className="flex items-center justify-end gap-1">
                      <s className="text-xs text-muted-foreground">
                        {formatMoney(line.regularPriceSatang)}
                      </s>
                      <DiscountBadge
                        priceSatang={line.unitPriceSatang}
                        regularPriceSatang={line.regularPriceSatang}
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {line.qty.toLocaleString('th-TH')}
                  {line.returnedQty > 0 && (
                    <div className="text-xs text-amber-700">
                      คืน {line.returnedQty.toLocaleString('th-TH')}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {formatMoney(line.lineTotalSatang)}
                </TableCell>
                {showCost && (
                  <TableCell className="text-right align-top text-muted-foreground tabular-nums">
                    {formatMoney(line.unitCostSatang)}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          {sale.savingsSatang > 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-right text-red-600">
                ประหยัดไป
              </TableCell>
              <TableCell className="text-right text-red-600 tabular-nums">
                {formatMoney(sale.savingsSatang)}
              </TableCell>
              {showCost && <TableCell />}
            </TableRow>
          )}
          <TableRow>
            <TableCell colSpan={3} className="text-right">
              ยอดรวม {sale.itemCount.toLocaleString('th-TH')} ชิ้น
            </TableCell>
            <TableCell className="text-right text-base font-semibold tabular-nums">
              {formatMoney(sale.totalSatang)}
            </TableCell>
            {showCost && (
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatMoney(sale.totalCostSatang)}
              </TableCell>
            )}
          </TableRow>
          {sale.refundedSatang > 0 && (
            <>
              <TableRow>
                <TableCell colSpan={3} className="text-right">
                  คืนเงินแล้ว
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  −{formatMoney(sale.refundedSatang)}
                </TableCell>
                {showCost && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right">
                  ยอดสุทธิ
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(netSatang)}
                </TableCell>
                {showCost && <TableCell />}
              </TableRow>
            </>
          )}
          {showCost && sale.status === 'paid' && (
            <TableRow>
              <TableCell colSpan={3} className="text-right">
                กำไร{sale.returnCount > 0 && ' (หักรายการที่คืนแล้ว)'}
              </TableCell>
              <TableCell className="text-right font-semibold text-emerald-700 tabular-nums">
                {formatMoney(sale.profitSatang)}
              </TableCell>
              <TableCell />
            </TableRow>
          )}
        </TableFooter>
      </Table>
    </div>
  );
}

type SaleDialog = 'receipt' | null;

export function SaleDetailPage() {
  const id = Number(useParams().id);
  const user = useCurrentUser();
  const showCost = user.can('cost.view');
  const format = useFormat();
  const { data: sale, isPending, error } = useSale(id);
  // The POS links here with ?receipt=1 so the receipt opens right after a sale.
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<SaleDialog>(params.get('receipt') ? 'receipt' : null);
  const closeDialog = () => {
    setDialog(null);
    if (params.has('receipt')) setParams({}, { replace: true });
  };
  useDocumentTitle(sale ? `บิลขาย ${sale.docNo}` : undefined);

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !sale) return <p className="text-destructive">{errorMessage(error)}</p>;
  const payment = sale.payment;

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/sales">
          <ArrowLeft />
          ประวัติการขาย
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">บิลขาย {sale.docNo}</h1>
          <SaleStatusBadge status={sale.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog('receipt')}>
            <ReceiptText />
            ใบเสร็จ
          </Button>
        </div>
      </div>

      {sale.status === 'voided' && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          บิลนี้ถูกยกเลิกโดย {sale.voidedByName ?? '–'} เมื่อ {format.dateTime(sale.voidedAt)}
          {sale.voidReason && ` · เหตุผล: ${sale.voidReason}`} (คืนสต็อกแล้ว)
        </p>
      )}

      <Card className="mb-4">
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="วันเวลาขาย">{format.dateTime(sale.soldAt)}</Info>
            <Info label="พนักงานขาย">{sale.salespersonName ?? '–'}</Info>
            <Info label="ลูกค้า">
              {sale.customerId ? (
                <Link to={`/customers/${sale.customerId}`} className="hover:underline">
                  {sale.customerName}
                </Link>
              ) : (
                sale.customerName || 'ลูกค้าทั่วไป'
              )}
              {sale.customerPhone && (
                <div className="text-xs text-muted-foreground">{sale.customerPhone}</div>
              )}
            </Info>
            <Info label="การชำระเงิน">
              {payment ? (
                <>
                  {PAYMENT_METHOD_LABELS[payment.method]} {formatMoney(payment.amountSatang)}
                  {payment.method === 'cash' && (
                    <div className="text-xs text-muted-foreground">
                      รับมา {formatMoney(payment.receivedSatang)} · ทอน{' '}
                      {formatMoney(payment.changeSatang)}
                    </div>
                  )}
                  {payment.voidedAt && (
                    <div className="text-xs text-destructive">ยกเลิกการชำระแล้ว</div>
                  )}
                </>
              ) : (
                '–'
              )}
            </Info>
          </dl>
          {sale.note && (
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-line">
              {sale.note}
            </p>
          )}
        </CardContent>
      </Card>

      <SaleLines sale={sale} showCost={showCost} />

      {sale.returns.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">การคืนสินค้าจากบิลนี้</h2>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ใบคืน</TableHead>
                  <TableHead>วันเวลา</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                  <TableHead className="text-right">คืนเงิน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.returns.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell className="font-medium">
                      <Link to={`/returns/${ret.id}`} className="hover:underline">
                        {ret.docNo}
                      </Link>
                    </TableCell>
                    <TableCell>{format.dateTime(ret.returnedAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ret.itemCount.toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ret.refundMethod === 'none'
                        ? REFUND_METHOD_LABELS.none
                        : `${formatMoney(ret.refundSatang)} (${REFUND_METHOD_LABELS[ret.refundMethod]})`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {dialog === 'receipt' && <ReceiptDialog sale={sale} onClose={closeDialog} />}
    </div>
  );
}
