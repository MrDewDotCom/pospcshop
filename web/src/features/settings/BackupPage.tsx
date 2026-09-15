import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CircleAlert, DatabaseBackup, FolderOpen, History, RotateCcw } from 'lucide-react';
import { BACKUP_REASON_LABELS, type BackupOverview } from '@pcshop/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { FormAlert } from '@/components/FormAlert';
import { PageHeader } from '@/components/PageHeader';
import { errorMessage } from '@/lib/api';
import { formatBytes, useFormat } from '@/lib/format';
import {
  useBackups,
  useCreateBackup,
  useRestoreBackup,
  useUpdateBackupSettings,
} from './backupQueries';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

function StatusCard({ overview }: { overview: BackupOverview }) {
  const format = useFormat();
  const create = useCreateBackup();
  const [now] = useState(() => Date.now());
  const last = overview.lastSuccessAt ? Date.parse(overview.lastSuccessAt) : null;
  const stale = last === null || now - last > STALE_MS;
  const failedAfterSuccess =
    overview.lastError && (last === null || Date.parse(overview.lastError.at) > last);

  return (
    <Card>
      <CardHeader>
        <CardTitle>สถานะการสำรองข้อมูล</CardTitle>
        <CardDescription>
          ระบบสำรองข้อมูลอัตโนมัติวันละครั้งหลัง {String(overview.hour).padStart(2, '0')}:00 น.
          ถ้าเครื่องปิดอยู่ตอนนั้น จะสำรองให้ตอนเปิดโปรแกรมครั้งถัดไป
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {failedAfterSuccess && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>สำรองข้อมูลครั้งล่าสุดไม่สำเร็จ</AlertTitle>
            <AlertDescription>
              {format.dateTime(overview.lastError!.at)} · {overview.lastError!.message}
            </AlertDescription>
          </Alert>
        )}
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">สำรองสำเร็จล่าสุด</dt>
            <dd className={stale ? 'font-medium text-amber-700' : 'font-medium'}>
              {last ? format.dateTime(overview.lastSuccessAt) : 'ยังไม่เคยสำรอง'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">เก็บไว้ที่</dt>
            <dd className="font-mono text-xs break-all">{overview.directory}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">พื้นที่ว่างในไดรฟ์</dt>
            <dd>{formatBytes(overview.freeBytes)}</dd>
          </div>
        </dl>
        <div>
          <Button
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: (backup) =>
                  toast.success(`สำรองข้อมูลแล้ว (${formatBytes(backup.sizeBytes)})`),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
            disabled={create.isPending}
          >
            <DatabaseBackup />
            {create.isPending ? 'กำลังสำรองข้อมูล…' : 'สำรองข้อมูลตอนนี้'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsCard({ overview }: { overview: BackupOverview }) {
  const update = useUpdateBackupSettings();
  const [directory, setDirectory] = useState(overview.customDirectory ?? '');
  const [keepCount, setKeepCount] = useState(String(overview.keepCount));
  const [hour, setHour] = useState(String(overview.hour));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const keep = Number(keepCount);
    if (!Number.isInteger(keep) || keep < 1 || keep > 365) {
      toast.error('จำนวนที่เก็บต้องอยู่ระหว่าง 1–365 ชุด');
      return;
    }
    update.mutate(
      { directory, keepCount: keep, hour: Number(hour) },
      { onSuccess: () => toast.success('บันทึกการตั้งค่าสำรองข้อมูลแล้ว') },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ตั้งค่า</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <FormAlert error={update.error} />
            <Field>
              <FieldLabel htmlFor="backupDir">โฟลเดอร์เก็บข้อมูลสำรอง</FieldLabel>
              <Input
                id="backupDir"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder={overview.defaultDirectory}
                className="font-mono text-sm"
                autoComplete="off"
              />
              <FieldDescription>
                เว้นว่าง = ใช้โฟลเดอร์เริ่มต้น แนะนำให้เก็บไว้ไดรฟ์อื่น เช่น D:\PCShopBackup หรือ
                แฟลชไดรฟ์ เผื่อไดรฟ์ C เสีย
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="keepCount">เก็บข้อมูลสำรองล่าสุด (ชุด)</FieldLabel>
                <Input
                  id="keepCount"
                  inputMode="numeric"
                  value={keepCount}
                  onChange={(e) => setKeepCount(e.target.value)}
                  className="w-32"
                />
                <FieldDescription>ชุดที่เก่ากว่านี้จะถูกลบอัตโนมัติ</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="backupHour">สำรองอัตโนมัติหลังเวลา</FieldLabel>
                <Select value={hour} onValueChange={setHour}>
                  <SelectTrigger id="backupHour" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {String(h).padStart(2, '0')}:00 น.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

type RestoreTarget = { backupId: string; label: string } | { path: string; label: string };

function RestoreDialog({ target, onClose }: { target: RestoreTarget; onClose: () => void }) {
  const restore = useRestoreBackup();
  const [understood, setUnderstood] = useState(false);
  const run = () =>
    restore.mutate('backupId' in target ? { backupId: target.backupId } : { path: target.path }, {
      onSuccess: () => {
        toast.success('กู้คืนข้อมูลเรียบร้อย กรุณาเข้าสู่ระบบใหม่');
        // Every session ended; a full reload also clears any cached data from before the restore.
        setTimeout(() => window.location.assign('/login'), 1200);
      },
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !restore.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>กู้คืนข้อมูลจาก {target.label}?</DialogTitle>
          <DialogDescription>อ่านให้ครบก่อนกดยืนยัน</DialogDescription>
        </DialogHeader>
        <FormAlert error={restore.error} />
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            ข้อมูลทั้งหมดตอนนี้ (สินค้า สต็อก ใบรับสินค้า ผู้ใช้ รูปภาพ)
            <span className="font-semibold"> จะถูกแทนที่</span> ด้วยข้อมูลสำรองชุดนี้
          </li>
          <li>ระบบจะสำรองข้อมูลปัจจุบันไว้ก่อนเสมอ ถ้ากู้ผิดชุดสามารถกู้คืนกลับได้</li>
          <li>ทุกคน (รวมถึงคุณ) จะต้องเข้าสู่ระบบใหม่ ระหว่างกู้คืนห้ามปิดโปรแกรม</li>
        </ul>
        <div className="flex items-center gap-2">
          <Checkbox
            id="understood"
            checked={understood}
            onCheckedChange={(v) => setUnderstood(v === true)}
          />
          <Label htmlFor="understood">เข้าใจแล้ว ต้องการกู้คืนข้อมูล</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={restore.isPending}>
            ยกเลิก
          </Button>
          <Button
            variant="destructive"
            onClick={run}
            disabled={!understood || restore.isPending || restore.isSuccess}
          >
            <RotateCcw />
            {restore.isPending ? 'กำลังกู้คืน…' : 'กู้คืนข้อมูล'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BackupPage() {
  const { data: overview, isPending, error } = useBackups();
  const format = useFormat();
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);
  const [folder, setFolder] = useState('');

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !overview) return <p className="text-destructive">{errorMessage(error)}</p>;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="สำรองและกู้คืนข้อมูล"
        description="สำรองฐานข้อมูลและรูปภาพทั้งหมดของร้าน กู้คืนได้เมื่อเครื่องมีปัญหาหรือข้อมูลผิดพลาด"
      />
      <StatusCard overview={overview} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5" />
            ข้อมูลสำรอง ({overview.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันเวลา</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead className="text-right">สินค้า</TableHead>
                <TableHead className="text-right">บิลขาย</TableHead>
                <TableHead className="text-right">ขนาด</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    ยังไม่มีข้อมูลสำรอง กด “สำรองข้อมูลตอนนี้” เพื่อสร้างชุดแรก
                  </TableCell>
                </TableRow>
              )}
              {overview.items.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(backup.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={backup.reason === 'scheduled' ? 'secondary' : 'outline'}>
                      {BACKUP_REASON_LABELS[backup.reason]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {backup.productCount.toLocaleString('th-TH')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {backup.saleCount.toLocaleString('th-TH')}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatBytes(backup.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRestoring({
                          backupId: backup.id,
                          label: format.dateTime(backup.createdAt),
                        })
                      }
                    >
                      <RotateCcw />
                      กู้คืน
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SettingsCard
        key={`${overview.customDirectory}-${overview.keepCount}-${overview.hour}`}
        overview={overview}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-5" />
            กู้คืนจากโฟลเดอร์อื่น
          </CardTitle>
          <CardDescription>
            เช่น ข้อมูลสำรองที่คัดลอกไว้ในแฟลชไดรฟ์ ใส่ที่อยู่เต็มของโฟลเดอร์ “pcshop-backup-…”
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="E:\pcshop-backup-2026-09-12_220003"
            className="font-mono text-sm"
            aria-label="ที่อยู่โฟลเดอร์ข้อมูลสำรอง"
            autoComplete="off"
          />
          <Button
            variant="outline"
            disabled={!folder.trim()}
            onClick={() => setRestoring({ path: folder.trim(), label: folder.trim() })}
          >
            <RotateCcw />
            กู้คืนจากโฟลเดอร์นี้
          </Button>
        </CardContent>
      </Card>

      {restoring && <RestoreDialog target={restoring} onClose={() => setRestoring(null)} />}
    </div>
  );
}
