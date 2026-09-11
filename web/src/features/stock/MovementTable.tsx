import { Link } from 'react-router';
import { cn } from 'cn';
import { STOCK_MOVEMENT_TYPE_LABELS, type StockMovement } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
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

/** Where a movement's document lives in the app (documents without a page show just the number). */
function refLink(movement: StockMovement): string | null {
  if (movement.refType === 'goods_receipt' && movement.refId) return `/receiving/${movement.refId}`;
  return null;
}

export function MovementTable({
  items,
  isPending,
  error,
  showProduct = true,
  showCost = false,
  emptyText = 'ยังไม่มีความเคลื่อนไหว',
}: {
  items: StockMovement[] | undefined;
  isPending?: boolean;
  error?: unknown;
  showProduct?: boolean;
  showCost?: boolean;
  emptyText?: string;
}) {
  const format = useFormat();
  const columns = 5 + (showProduct ? 1 : 0) + (showCost ? 1 : 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>วันที่</TableHead>
          {showProduct && <TableHead>สินค้า</TableHead>}
          <TableHead>รายการ</TableHead>
          <TableHead className="text-right">จำนวน</TableHead>
          <TableHead className="text-right">คงเหลือ</TableHead>
          {showCost && <TableHead className="text-right">ต้นทุน/ชิ้น</TableHead>}
          <TableHead>ผู้ทำรายการ</TableHead>
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
        {!!error && (
          <TableRow>
            <TableCell colSpan={columns} className="text-center text-destructive">
              {errorMessage(error)}
            </TableCell>
          </TableRow>
        )}
        {items?.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns} className="py-6 text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        )}
        {items?.map((m) => {
          const link = refLink(m);
          return (
            <TableRow key={m.id}>
              <TableCell className="align-top whitespace-nowrap">
                {format.dateTime(m.createdAt)}
              </TableCell>
              {showProduct && (
                <TableCell className="max-w-64 align-top whitespace-normal">
                  <Link to={`/products/${m.productId}`} className="font-medium hover:underline">
                    {m.productName}
                  </Link>
                  <div className="text-xs text-muted-foreground">{m.productSku}</div>
                </TableCell>
              )}
              <TableCell className="max-w-72 align-top whitespace-normal">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{STOCK_MOVEMENT_TYPE_LABELS[m.type]}</Badge>
                  {m.refDocNo &&
                    (link ? (
                      <Link to={link} className="text-sm hover:underline">
                        {m.refDocNo}
                      </Link>
                    ) : (
                      <span className="text-sm">{m.refDocNo}</span>
                    ))}
                </div>
                {m.reason && <div className="mt-1 text-xs text-muted-foreground">{m.reason}</div>}
                {m.serialNos.length > 0 && (
                  <div className="mt-1 font-mono text-xs break-all text-muted-foreground">
                    S/N: {m.serialNos.join(', ')}
                  </div>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right align-top font-medium tabular-nums',
                  m.qtyChange > 0 ? 'text-green-700' : 'text-destructive',
                )}
              >
                {m.qtyChange > 0 ? '+' : '−'}
                {Math.abs(m.qtyChange).toLocaleString('th-TH')}
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                {m.balanceAfter.toLocaleString('th-TH')}
              </TableCell>
              {showCost && (
                <TableCell className="text-right align-top text-muted-foreground tabular-nums">
                  {formatMoney(m.unitCostSatang)}
                </TableCell>
              )}
              <TableCell className="align-top">{m.performedByName ?? '–'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
