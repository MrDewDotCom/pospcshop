import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BadgeCheck, Ban } from 'lucide-react';
import { SERIAL_STATUS_LABELS, type GoodsReceiptLine } from '@pcshop/shared';
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
import { errorMessage } from '@/lib/api';
import { formatMoney, useFormat } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/queries';
import { CostStatusBadge, VoidedBadge } from './CostStatusBadge';
import { useGoodsReceipt } from './queries';
import { VerifyCostsDialog, VoidReceiptDialog } from './ReceiptOwnerDialogs';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function SerialChips({ line }: { line: GoodsReceiptLine }) {
  if (line.serials.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {line.serials.map((serial) => (
        <Badge
          key={serial.id}
          variant="outline"
          className={
            serial.status === 'in_stock'
              ? 'font-mono font-normal'
              : 'font-mono font-normal opacity-60'
          }
          title={SERIAL_STATUS_LABELS[serial.status]}
        >
          {serial.serialNo}
          {serial.status !== 'in_stock' && ` · ${SERIAL_STATUS_LABELS[serial.status]}`}
        </Badge>
      ))}
    </div>
  );
}

export function ReceivingDetailPage() {
  const id = Number(useParams().id);
  const user = useCurrentUser();
  const showCost = user.can('cost.view');
  const format = useFormat();
  const { data: receipt, isPending, error } = useGoodsReceipt(id);
  const [dialog, setDialog] = useState<'verify' | 'void' | null>(null);

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !receipt) return <p className="text-destructive">{errorMessage(error)}</p>;
  const posted = receipt.status === 'posted';

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/receiving">
          <ArrowLeft />
          รายการรับสินค้า
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">ใบรับสินค้า {receipt.docNo}</h1>
          {receipt.status === 'voided' ? (
            <VoidedBadge />
          ) : (
            <CostStatusBadge status={receipt.costStatus} />
          )}
        </div>
        {posted && (
          <div className="flex flex-wrap gap-2">
            {user.can('goodsReceipt.void') && (
              <Button variant="outline" onClick={() => setDialog('void')}>
                <Ban />
                ยกเลิกใบรับสินค้า
              </Button>
            )}
            {receipt.costStatus === 'unverified' && user.can('goodsReceipt.verifyCost') && (
              <Button onClick={() => setDialog('verify')}>
                <BadgeCheck />
                ตรวจสอบต้นทุน
              </Button>
            )}
          </div>
        )}
      </div>

      {receipt.costStatus === 'unverified' && receipt.status !== 'voided' && (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {showCost
            ? 'ใบนี้พนักงานเป็นผู้รับ ต้นทุนยังเป็นค่าชั่วคราว กรุณาตรวจสอบต้นทุนกับบิลของผู้จำหน่าย'
            : 'สินค้าเข้าสต็อกแล้ว ต้นทุนรอเจ้าของร้านตรวจสอบ'}
        </p>
      )}

      <Card className="mb-4">
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="วันที่รับ">{format.dateTime(receipt.receivedAt)}</Info>
            <Info label="ผู้จำหน่าย">{receipt.supplierName ?? 'ไม่ระบุ'}</Info>
            <Info label="เลขที่บิลผู้จำหน่าย">{receipt.supplierInvoiceNo || '–'}</Info>
            <Info label="ผู้รับสินค้า">{receipt.createdByName ?? '–'}</Info>
            {receipt.costVerifiedAt && (
              <Info label="ตรวจสอบต้นทุนโดย">
                {receipt.costVerifiedByName ?? '–'} · {format.dateTime(receipt.costVerifiedAt)}
              </Info>
            )}
            {receipt.voidedAt && (
              <Info label="ยกเลิกโดย">
                {receipt.voidedByName ?? '–'} · {format.dateTime(receipt.voidedAt)}
                {receipt.voidReason && (
                  <div className="text-muted-foreground">เหตุผล: {receipt.voidReason}</div>
                )}
              </Info>
            )}
          </dl>
          {receipt.notes && (
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-line">
              {receipt.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>สินค้า</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              {showCost && <TableHead className="text-right">ต้นทุน/ชิ้น</TableHead>}
              {showCost && <TableHead className="text-right">รวม</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipt.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="align-top whitespace-normal">
                  <Link to={`/products/${line.productId}`} className="font-medium hover:underline">
                    {line.productName}
                  </Link>
                  <div className="text-xs text-muted-foreground">{line.productSku}</div>
                  <SerialChips line={line} />
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {line.qty.toLocaleString('th-TH')}
                </TableCell>
                {showCost && (
                  <TableCell className="text-right align-top tabular-nums">
                    {formatMoney(line.unitCostSatang)}
                    {line.costSource === 'average' && (
                      <div className="text-xs text-muted-foreground">ใช้ต้นทุนเฉลี่ยเดิม</div>
                    )}
                  </TableCell>
                )}
                {showCost && (
                  <TableCell className="text-right align-top tabular-nums">
                    {formatMoney(line.lineTotalSatang)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>รวม {receipt.lineCount} รายการ</TableCell>
              <TableCell className="text-right tabular-nums">
                {receipt.totalQty.toLocaleString('th-TH')} ชิ้น
              </TableCell>
              {showCost && <TableCell />}
              {showCost && (
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(receipt.totalCostSatang)}
                </TableCell>
              )}
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {dialog === 'verify' && (
        <VerifyCostsDialog receipt={receipt} onClose={() => setDialog(null)} />
      )}
      {dialog === 'void' && <VoidReceiptDialog receipt={receipt} onClose={() => setDialog(null)} />}
    </div>
  );
}
