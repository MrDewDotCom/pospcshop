import type { Sale } from '@pcshop/shared';
import { DocumentDialog } from '@/documents/DocumentDialog';
import { ReceiptDocument } from '@/documents/ReceiptDocument';
import { useShopSettings } from '@/features/settings/queries';

export function ReceiptDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { data: shop } = useShopSettings();
  if (!shop) return null;
  return (
    <DocumentDialog
      title={`ใบเสร็จ ${sale.docNo}`}
      description="ดาวน์โหลดรูปแล้วส่งให้ลูกค้าทาง LINE หรือ Messenger"
      filename={sale.docNo}
      onClose={onClose}
      render={(ref) => <ReceiptDocument ref={ref} sale={sale} shop={shop} />}
    />
  );
}
