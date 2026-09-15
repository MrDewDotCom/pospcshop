import type { Ref } from 'react';
import {
  addBangkokMonths,
  bahtText,
  discountBadgeLabel,
  formatBaht,
  formatThaiDate,
  formatThaiDateTime,
  formatWarranty,
  PAYMENT_METHOD_LABELS,
  type Sale,
  type SaleLine,
  type StaffShopSettings,
} from '@pcshop/shared';
import { DOC, DocumentLayout } from './DocumentLayout';

const money = (satang: number) => formatBaht(satang);

function Line({
  line,
  soldAtMs,
  buddhistEra,
}: {
  line: SaleLine;
  soldAtMs: number;
  buddhistEra: boolean;
}) {
  const badge =
    line.regularPriceSatang !== null
      ? discountBadgeLabel({
          priceSatang: line.unitPriceSatang,
          regularPriceSatang: line.regularPriceSatang,
        })
      : null;
  const hasWarranty = line.warrantyType !== 'none' && line.warrantyMonths > 0;
  const warrantyEnd = hasWarranty
    ? formatThaiDate(addBangkokMonths(soldAtMs, line.warrantyMonths), { buddhistEra })
    : null;

  return (
    <div className={`border-b border-dashed py-2 ${DOC.border}`}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0 font-semibold">{line.name}</div>
        <div className="shrink-0 font-semibold tabular-nums">{money(line.lineTotalSatang)}</div>
      </div>
      <div className={`flex flex-wrap items-center gap-x-2 text-[13px] ${DOC.muted}`}>
        <span className="tabular-nums">
          {line.qty.toLocaleString('th-TH')} × {money(line.unitPriceSatang)}
        </span>
        {badge && (
          <>
            <s className="tabular-nums">{money(line.regularPriceSatang!)}</s>
            <span className="rounded bg-[#dc2626] px-1 text-[12px] font-semibold text-white">
              {badge}
            </span>
          </>
        )}
      </div>
      <div className={`text-[13px] ${DOC.muted}`}>
        {formatWarranty(line.warrantyType, line.warrantyMonths)}
        {warrantyEnd && ` (ถึง ${warrantyEnd})`}
      </div>
      {line.serials.length > 0 && (
        <div className={`text-[13px] break-all ${DOC.muted}`}>
          S/N: {line.serials.map((s) => s.serialNo).join(', ')}
        </div>
      )}
    </div>
  );
}

/** The receipt sent to the customer as a PNG (LINE/Messenger) or an A4 PDF (Q5, PLAN.md §11). */
export function ReceiptDocument({
  ref,
  sale,
  shop,
}: {
  ref?: Ref<HTMLDivElement>;
  sale: Sale;
  shop: StaffShopSettings;
}) {
  const buddhistEra = shop.useBuddhistEra;
  const soldAtMs = Date.parse(sale.soldAt);
  const payment = sale.payment;

  return (
    <DocumentLayout
      ref={ref}
      shop={shop}
      title="ใบเสร็จรับเงิน"
      docNo={sale.docNo}
      date={formatThaiDateTime(soldAtMs, { buddhistEra })}
      footer={shop.receiptFooter || 'ขอบคุณที่ใช้บริการ'}
    >
      {sale.status === 'voided' && (
        <div className="mt-3 rounded border-2 border-[#dc2626] px-3 py-1 text-center font-bold text-[#dc2626]">
          ยกเลิกแล้ว{sale.voidReason ? ` · ${sale.voidReason}` : ''}
        </div>
      )}

      {(sale.customerName || sale.customerPhone) && (
        <div className="mt-2 text-[14px]">
          <span className={DOC.muted}>ลูกค้า </span>
          {[sale.customerName, sale.customerPhone].filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="mt-1">
        {sale.lines
          .filter((line) => line.parentItemId === null)
          .map((line) => (
            <Line key={line.id} line={line} soldAtMs={soldAtMs} buddhistEra={buddhistEra} />
          ))}
      </div>

      <div className="mt-2 space-y-0.5">
        <div className="flex justify-between text-[14px]">
          <span className={DOC.muted}>รวม {sale.itemCount.toLocaleString('th-TH')} ชิ้น</span>
        </div>
        {sale.savingsSatang > 0 && (
          <div className={`flex justify-between text-[14px] font-semibold ${DOC.red}`}>
            <span>ประหยัดไป</span>
            <span className="tabular-nums">฿{money(sale.savingsSatang)}</span>
          </div>
        )}
        <div className="flex items-end justify-between pt-1">
          <span className="font-bold">ยอดรวมทั้งสิ้น</span>
          <span className="text-2xl font-bold tabular-nums">฿{money(sale.totalSatang)}</span>
        </div>
        <div className={`text-right text-[13px] ${DOC.muted}`}>({bahtText(sale.totalSatang)})</div>
      </div>

      {payment && (
        <div className={`mt-3 rounded bg-[#f3f4f6] px-3 py-2 text-[14px]`}>
          <div className="flex justify-between">
            <span>ชำระโดย {PAYMENT_METHOD_LABELS[payment.method]}</span>
            <span className="tabular-nums">฿{money(payment.receivedSatang)}</span>
          </div>
          {payment.method === 'cash' && (
            <div className="flex justify-between">
              <span>เงินทอน</span>
              <span className="tabular-nums">฿{money(payment.changeSatang)}</span>
            </div>
          )}
        </div>
      )}

      {sale.refundedSatang > 0 && (
        <div className={`mt-2 text-[13px] ${DOC.muted}`}>
          มีการคืนสินค้า คืนเงินแล้ว ฿{money(sale.refundedSatang)} (
          {sale.returns.map((r) => r.docNo).join(', ')})
        </div>
      )}

      {sale.salespersonName && (
        <div className={`mt-2 text-[13px] ${DOC.muted}`}>พนักงานขาย {sale.salespersonName}</div>
      )}
    </DocumentLayout>
  );
}
