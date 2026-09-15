import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, FileText, Pencil } from 'lucide-react';
import {
  REFUND_METHOD_LABELS,
  RESOLVED_RETURN_DISPOSITIONS,
  RETURN_RESOLVE_ACTION_LABELS,
  type ResolvedReturnDisposition,
  type ReturnLine,
  type SaleReturn,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { errorMessage } from '@/lib/api';
import { formatMoney, useFormat } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { DocumentDialog } from '@/documents/DocumentDialog';
import { ReturnSlipDocument } from '@/documents/ReturnSlipDocument';
import { useCurrentUser } from '@/features/auth/queries';
import { DispositionBadge } from '@/features/sales/SaleBadges';
import { useShopSettings } from '@/features/settings/queries';
import { useReturn } from './queries';
import { RefundDialog } from './RefundDialog';
import { ResolveDialog } from './ResolveDialog';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ReturnSlipDialog({ ret, onClose }: { ret: SaleReturn; onClose: () => void }) {
  const { data: shop } = useShopSettings();
  if (!shop) return null;
  return (
    <DocumentDialog
      title={`ใบรับคืนสินค้า ${ret.docNo}`}
      description="ดาวน์โหลดรูปแล้วส่งให้ลูกค้าเป็นหลักฐานการคืนสินค้า"
      filename={ret.docNo}
      onClose={onClose}
      render={(ref) => <ReturnSlipDocument ref={ref} ret={ret} shop={shop} />}
    />
  );
}

export function ReturnDetailPage() {
  const id = Number(useParams().id);
  const user = useCurrentUser();
  const showCost = user.can('cost.view');
  const format = useFormat();
  const { data: ret, isPending, error } = useReturn(id);
  const [dialog, setDialog] = useState<'slip' | 'refund' | null>(null);
  const [resolving, setResolving] = useState<{
    line: ReturnLine;
    disposition: ResolvedReturnDisposition;
  } | null>(null);
  useDocumentTitle(ret ? `ใบคืนสินค้า ${ret.docNo}` : undefined);

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !ret) return <p className="text-destructive">{errorMessage(error)}</p>;

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/returns">
          <ArrowLeft />
          สินค้าคืน
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">ใบคืนสินค้า {ret.docNo}</h1>
          {ret.pendingCount > 0 ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900">
              รอตรวจสอบ {ret.pendingCount} ชิ้น
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
              จัดการครบแล้ว
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {user.can('return.editRefund') && ret.refundMethod !== 'none' && (
            <Button variant="outline" onClick={() => setDialog('refund')}>
              <Pencil />
              แก้ยอดคืนเงิน
            </Button>
          )}
          <Button onClick={() => setDialog('slip')}>
            <FileText />
            ใบรับคืน
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="วันเวลาที่รับคืน">{format.dateTime(ret.returnedAt)}</Info>
            <Info label="บิลขาย">
              <Link to={`/sales/${ret.saleId}`} className="hover:underline">
                {ret.saleDocNo}
              </Link>
              <div className="text-xs text-muted-foreground">
                ขายเมื่อ {format.date(ret.saleSoldAt)}
              </div>
            </Info>
            <Info label="ลูกค้า">
              {ret.customerName || 'ลูกค้าทั่วไป'}
              {ret.customerPhone && (
                <div className="text-xs text-muted-foreground">{ret.customerPhone}</div>
              )}
            </Info>
            <Info label="การคืนเงิน">
              {ret.refundMethod === 'none' ? (
                REFUND_METHOD_LABELS.none
              ) : (
                <>
                  {REFUND_METHOD_LABELS[ret.refundMethod]} {formatMoney(ret.refundSatang)}
                  {ret.refundAdjustedAt && (
                    <div className="text-xs text-muted-foreground">
                      แก้ยอดโดย {ret.refundAdjustedByName ?? '–'} ·{' '}
                      {format.dateTime(ret.refundAdjustedAt)} (เดิม{' '}
                      {formatMoney(ret.maxRefundSatang)})
                    </div>
                  )}
                </>
              )}
            </Info>
            <div className="col-span-2">
              <Info label="เหตุผลที่คืน">{ret.reason}</Info>
            </div>
            <Info label="ผู้รับคืน">{ret.createdByName ?? '–'}</Info>
          </dl>
        </CardContent>
      </Card>

      {/* Rows that wrap instead of a table: this page is used on phones, and the resolve buttons must
          stay on screen without scrolling sideways. */}
      <ul className="divide-y rounded-lg border bg-background">
        {ret.lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <Link to={`/products/${line.productId}`} className="font-medium hover:underline">
                {line.productName}
              </Link>
              <div className="text-xs text-muted-foreground">{line.productSku}</div>
              {line.serialNo && (
                <Badge variant="outline" className="mt-1 font-mono font-normal">
                  {line.serialNo}
                </Badge>
              )}
            </div>
            <dl className="flex gap-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">จำนวน</dt>
                <dd className="tabular-nums">{line.qty.toLocaleString('th-TH')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">คืนเงิน</dt>
                <dd className="tabular-nums">{formatMoney(line.refundSatang)}</dd>
              </div>
              {showCost && (
                <div>
                  <dt className="text-xs text-muted-foreground">ต้นทุน/ชิ้น</dt>
                  <dd className="text-muted-foreground tabular-nums">
                    {formatMoney(line.unitCostSatang)}
                  </dd>
                </div>
              )}
            </dl>
            <div className="basis-full md:basis-64">
              <DispositionBadge disposition={line.disposition} />
              {line.resolvedAt && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {line.resolvedByName ?? '–'} · {format.dateTime(line.resolvedAt)}
                  {line.resolutionNote && <div>{line.resolutionNote}</div>}
                </div>
              )}
              {line.disposition === 'pending' && user.can('return.resolve') && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RESOLVED_RETURN_DISPOSITIONS.map((disposition) => (
                    <Button
                      key={disposition}
                      size="sm"
                      variant={disposition === 'restocked' ? 'default' : 'outline'}
                      onClick={() => setResolving({ line, disposition })}
                    >
                      {RETURN_RESOLVE_ACTION_LABELS[disposition]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {dialog === 'slip' && <ReturnSlipDialog ret={ret} onClose={() => setDialog(null)} />}
      {dialog === 'refund' && <RefundDialog ret={ret} onClose={() => setDialog(null)} />}
      {resolving && (
        <ResolveDialog
          ret={ret}
          line={resolving.line}
          disposition={resolving.disposition}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  );
}
