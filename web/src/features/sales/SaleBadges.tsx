import {
  PAYMENT_METHOD_LABELS,
  RETURN_DISPOSITION_LABELS,
  type PaymentMethod,
  type ReturnDisposition,
  type SaleStatus,
} from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return status === 'voided' ? (
    <Badge variant="destructive">ยกเลิกแล้ว</Badge>
  ) : (
    <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
      ชำระแล้ว
    </Badge>
  );
}

export function PaymentMethodText({ method }: { method: PaymentMethod | null }) {
  return <>{method ? PAYMENT_METHOD_LABELS[method] : '–'}</>;
}

export function DispositionBadge({ disposition }: { disposition: ReturnDisposition }) {
  const className =
    disposition === 'pending'
      ? 'bg-amber-100 text-amber-900'
      : disposition === 'restocked'
        ? 'bg-emerald-100 text-emerald-900'
        : undefined;
  return (
    <Badge variant="secondary" className={className}>
      {disposition === 'pending' ? 'สินค้าคืน – รอตรวจสอบ' : RETURN_DISPOSITION_LABELS[disposition]}
    </Badge>
  );
}
