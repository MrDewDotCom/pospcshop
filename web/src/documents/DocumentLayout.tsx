import type { ReactNode, Ref } from 'react';
// The document font, bundled locally (each weight file covers Thai via unicode-range).
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/600.css';
import '@fontsource/sarabun/700.css';
import type { StaffShopSettings } from '@pcshop/shared';

/** 540px layout × pixel ratio 2 = the 1080px-wide image LINE and Messenger show well. */
export const DOCUMENT_WIDTH_PX = 540;

// Documents sent to customers (receipts, return slips; quotes and repair slips later) share this
// frame. They're exported as images, so colors are plain hex values (not the app's theme variables)
// and the font is Sarabun, loaded locally.

export const DOC = {
  text: 'text-[#111827]',
  muted: 'text-[#6b7280]',
  border: 'border-[#e5e7eb]',
  red: 'text-[#dc2626]',
} as const;

export function DocumentLayout({
  ref,
  shop,
  title,
  docNo,
  date,
  children,
  footer,
}: {
  ref?: Ref<HTMLDivElement>;
  shop: Pick<StaffShopSettings, 'shopName' | 'logoUrl' | 'address' | 'phone' | 'lineId'>;
  title: string;
  docNo: string;
  /** Already formatted for display. */
  date: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      ref={ref}
      style={{ width: DOCUMENT_WIDTH_PX }}
      className={`bg-white px-8 py-7 font-document text-[15px] leading-relaxed ${DOC.text}`}
    >
      <header className="flex items-start gap-3">
        {shop.logoUrl && (
          <img src={shop.logoUrl} alt="" className="max-h-16 max-w-24 object-contain" />
        )}
        <div className="min-w-0">
          <div className="text-xl leading-snug font-bold">{shop.shopName}</div>
          {shop.address && (
            <div className={`text-[13px] leading-snug whitespace-pre-line ${DOC.muted}`}>
              {shop.address}
            </div>
          )}
          {(shop.phone || shop.lineId) && (
            <div className={`text-[13px] ${DOC.muted}`}>
              {[shop.phone && `โทร ${shop.phone}`, shop.lineId && `LINE ${shop.lineId}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
      </header>

      <div className={`mt-4 flex items-end justify-between border-b-2 pb-2 ${DOC.border}`}>
        <div className="text-lg font-bold">{title}</div>
        <div className="text-right text-[13px] leading-snug">
          <div>
            เลขที่ <span className="font-semibold">{docNo}</span>
          </div>
          <div className={DOC.muted}>{date}</div>
        </div>
      </div>

      {children}

      {footer && (
        <footer
          className={`mt-6 border-t pt-3 text-center text-[13px] whitespace-pre-line ${DOC.border} ${DOC.muted}`}
        >
          {footer}
        </footer>
      )}
    </div>
  );
}
