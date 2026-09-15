import type { Ref } from 'react';
import {
  bahtText,
  formatBaht,
  formatThaiDate,
  formatThaiDateTime,
  REFUND_METHOD_LABELS,
  type SaleReturn,
  type StaffShopSettings,
} from '@pcshop/shared';
import { DOC, DocumentLayout } from './DocumentLayout';

/** What the customer gets when they bring something back (§7.8): a PNG or A4 PDF like the receipt. */
export function ReturnSlipDocument({
  ref,
  ret,
  shop,
}: {
  ref?: Ref<HTMLDivElement>;
  ret: SaleReturn;
  shop: StaffShopSettings;
}) {
  const buddhistEra = shop.useBuddhistEra;
  // Serial units are one row each; show them grouped under their product line.
  const groups = new Map<
    number,
    { name: string; qty: number; refund: number; serials: string[] }
  >();
  for (const line of ret.lines) {
    const group = groups.get(line.saleItemId) ?? {
      name: line.productName,
      qty: 0,
      refund: 0,
      serials: [],
    };
    group.qty += line.qty;
    group.refund += line.refundSatang;
    if (line.serialNo) group.serials.push(line.serialNo);
    groups.set(line.saleItemId, group);
  }

  return (
    <DocumentLayout
      ref={ref}
      shop={shop}
      title="ใบรับคืนสินค้า"
      docNo={ret.docNo}
      date={formatThaiDateTime(Date.parse(ret.returnedAt), { buddhistEra })}
      footer="สินค้าที่รับคืนจะได้รับการตรวจสอบตามเงื่อนไขของร้าน"
    >
      <div className="mt-2 text-[14px] leading-snug">
        <div>
          <span className={DOC.muted}>อ้างอิงบิลขาย </span>
          {ret.saleDocNo}
          <span className={DOC.muted}>
            {' '}
            (วันที่ {formatThaiDate(Date.parse(ret.saleSoldAt), { buddhistEra })})
          </span>
        </div>
        {(ret.customerName || ret.customerPhone) && (
          <div>
            <span className={DOC.muted}>ลูกค้า </span>
            {[ret.customerName, ret.customerPhone].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      <div className="mt-2">
        {[...groups.values()].map((group, index) => (
          <div key={index} className={`border-b border-dashed py-2 ${DOC.border}`}>
            <div className="flex justify-between gap-3">
              <div className="min-w-0 font-semibold">{group.name}</div>
              <div className="shrink-0 tabular-nums">{group.qty.toLocaleString('th-TH')} ชิ้น</div>
            </div>
            {group.serials.length > 0 && (
              <div className={`text-[13px] break-all ${DOC.muted}`}>
                S/N: {group.serials.join(', ')}
              </div>
            )}
            {ret.refundMethod !== 'none' && (
              <div className={`text-right text-[13px] tabular-nums ${DOC.muted}`}>
                คืนเงิน {formatBaht(group.refund)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 text-[14px]">
        <span className={DOC.muted}>เหตุผลที่คืน </span>
        {ret.reason}
      </div>

      <div className="mt-3 rounded bg-[#f3f4f6] px-3 py-2">
        {ret.refundMethod === 'none' ? (
          <div className="font-semibold">ไม่มีการคืนเงิน</div>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <span className="font-bold">{REFUND_METHOD_LABELS[ret.refundMethod]}</span>
              <span className="text-2xl font-bold tabular-nums">
                ฿{formatBaht(ret.refundSatang)}
              </span>
            </div>
            <div className={`text-right text-[13px] ${DOC.muted}`}>
              ({bahtText(ret.refundSatang)})
            </div>
          </>
        )}
      </div>

      {ret.createdByName && (
        <div className={`mt-2 text-[13px] ${DOC.muted}`}>ผู้รับคืน {ret.createdByName}</div>
      )}
    </DocumentLayout>
  );
}
