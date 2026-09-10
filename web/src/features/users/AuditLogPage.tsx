import { useState } from 'react';
import {
  AUDIT_ACTION_LABELS,
  ROLE_LABELS,
  auditActionLabel,
  type AuditLogItem,
  type Role,
} from '@pcshop/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAuditLogs } from './queries';

const PAGE_SIZE = 30;
const ALL = 'all';

const FIELD_LABELS: Record<string, string> = { name: 'ชื่อ', role: 'ตำแหน่ง', isActive: 'สถานะ' };

function formatValue(field: string, value: unknown): string {
  if (field === 'role') return ROLE_LABELS[value as Role] ?? String(value);
  if (field === 'isActive') return value ? 'ใช้งานอยู่' : 'ปิดใช้งาน';
  return String(value);
}

/** A short Thai summary of an audit entry's details. */
function describe(item: AuditLogItem): string {
  const detail = item.detail ?? {};
  const parts: string[] = [];
  if (typeof detail.username === 'string') parts.push(`ผู้ใช้: ${detail.username}`);
  if (typeof detail.role === 'string') parts.push(`ตำแหน่ง: ${formatValue('role', detail.role)}`);
  const changes = detail.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  for (const [field, change] of Object.entries(changes ?? {})) {
    parts.push(
      `${FIELD_LABELS[field] ?? field}: ${formatValue(field, change.from)} → ${formatValue(field, change.to)}`,
    );
  }
  if (typeof detail.ip === 'string') parts.push(`จาก ${detail.ip}`);
  return parts.join(' · ');
}

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState(ALL);
  const { data, isPending, error } = useAuditLogs({
    page,
    pageSize: PAGE_SIZE,
    action: action === ALL ? undefined : action,
  });

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="ประวัติการใช้งาน"
        description="บันทึกว่าใครทำอะไรในระบบ เช่น เข้าสู่ระบบ เพิ่มผู้ใช้ ยกเลิกบิล หรือเปลี่ยนราคา"
        actions={
          <Select
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกรายการ</SelectItem>
              {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">วันเวลา</TableHead>
              <TableHead>ผู้ใช้</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead>รายละเอียด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  ไม่มีรายการ
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTime(item.createdAt)}
                </TableCell>
                <TableCell>{item.userName ?? 'ระบบ'}</TableCell>
                <TableCell>{auditActionLabel(item.action)}</TableCell>
                <TableCell className="text-sm whitespace-normal text-muted-foreground">
                  {describe(item)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
