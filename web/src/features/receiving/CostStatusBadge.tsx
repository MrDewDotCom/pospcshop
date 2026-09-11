import { COST_STATUS_LABELS, type CostStatus } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';

export function CostStatusBadge({ status }: { status: CostStatus }) {
  return status === 'unverified' ? (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
      {COST_STATUS_LABELS.unverified}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
      {COST_STATUS_LABELS.verified}
    </Badge>
  );
}

export function VoidedBadge() {
  return <Badge variant="destructive">ยกเลิกแล้ว</Badge>;
}
