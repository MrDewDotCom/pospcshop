import { useState } from 'react';
import { toast } from 'sonner';
import { CircleAlert, Info, Trash2 } from 'lucide-react';
import type { SampleDataStatus } from '@pcshop/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Label } from '@/components/ui/label';
import { FormAlert } from '@/components/FormAlert';
import { PageHeader } from '@/components/PageHeader';
import { errorMessage } from '@/lib/api';
import { useClearSampleData, useSampleData } from './seedQueries';

const thai = (n: number) => n.toLocaleString('th-TH');

/** Confirmation with the stock effect spelled out: the sample stock leaves the system entirely. */
function ClearDialog({ status, onClose }: { status: SampleDataStatus; onClose: () => void }) {
  const clear = useClearSampleData();
  const [understood, setUnderstood] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && !clear.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ลบข้อมูลตัวอย่างทั้งชุด?</DialogTitle>
          <DialogDescription>ตรวจสอบผลที่จะเกิดขึ้นก่อนยืนยัน</DialogDescription>
        </DialogHeader>
        <FormAlert error={clear.error} />
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            ลบสินค้าตัวอย่าง {thai(status.products)} รายการ พร้อมรูป แท็ก ประวัติราคา ซีเรียล
            และใบรับสินค้าตัวอย่าง {thai(status.goodsReceipts)} ใบ
          </li>
          <li>
            <span className="font-semibold">สต็อกของสินค้าตัวอย่างจะหายไปทั้งหมด</span>{' '}
            เพราะสินค้าถูกลบออกจากระบบ (ไม่ใช่การปรับสต็อก)
            ประวัติการเคลื่อนไหวของสินค้าเหล่านี้จะถูกลบด้วย
          </li>
          <li>
            ผู้จำหน่ายตัวอย่าง {thai(status.suppliers)} ราย และแท็กตัวอย่าง {thai(status.tags)} แท็ก
            จะถูกลบ ยกเว้นรายที่ร้านนำไปใช้กับข้อมูลจริงแล้ว ระบบจะเก็บไว้ให้
          </li>
          <li>สินค้า ใบรับสินค้า และสต็อกที่ร้านบันทึกเองจะไม่ถูกแตะต้อง</li>
          <li>เลขที่เอกสารที่ใช้ไปแล้วจะไม่ถูกนำกลับมาใช้ใหม่</li>
        </ul>
        <div className="flex items-center gap-2">
          <Checkbox
            id="clear-understood"
            checked={understood}
            onCheckedChange={(v) => setUnderstood(v === true)}
          />
          <Label htmlFor="clear-understood">เข้าใจแล้ว ต้องการลบข้อมูลตัวอย่าง</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={clear.isPending}>
            ยกเลิก
          </Button>
          <Button
            variant="destructive"
            disabled={!understood || clear.isPending}
            onClick={() =>
              clear.mutate(undefined, {
                onSuccess: (result) => {
                  const kept = result.kept.tags + result.kept.suppliers;
                  toast.success(
                    `ลบข้อมูลตัวอย่างแล้ว (สินค้า ${thai(result.cleared.products)} รายการ)` +
                      (kept > 0
                        ? ` · เก็บแท็ก/ผู้จำหน่ายที่ใช้งานอยู่ไว้ ${thai(kept)} รายการ`
                        : ''),
                  );
                  onClose();
                },
              })
            }
          >
            <Trash2 />
            {clear.isPending ? 'กำลังลบ…' : 'ลบข้อมูลตัวอย่าง'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SampleDataPage() {
  const { data: status, isPending, error } = useSampleData();
  const [confirming, setConfirming] = useState(false);

  if (isPending) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (error || !status) return <p className="text-destructive">{errorMessage(error)}</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="ข้อมูลตัวอย่าง"
        description="ข้อมูลที่ระบบใส่ให้ตอนตั้งค่าร้านครั้งแรก เพื่อให้ทดลองใช้งานได้ทันที"
      />

      {!status.hasSampleData ? (
        <Alert>
          <Info />
          <AlertTitle>ไม่มีข้อมูลตัวอย่างในระบบ</AlertTitle>
          <AlertDescription>
            สินค้า ผู้จำหน่าย และใบรับสินค้าทั้งหมดที่เห็นในระบบ เป็นข้อมูลที่ร้านบันทึกเอง
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลตัวอย่างที่มีอยู่</CardTitle>
              <CardDescription>
                ราคาและต้นทุนของสินค้าตัวอย่างเป็นเพียงตัวเลขสมมติ ไม่ใช่ราคาตลาดจริง
                เมื่อพร้อมเริ่มใช้งานจริงควรลบทั้งชุดออก แล้วบันทึกสินค้าของร้านเอง
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  { label: 'สินค้า', value: status.products },
                  { label: 'ใบรับสินค้า', value: status.goodsReceipts },
                  { label: 'ผู้จำหน่าย', value: status.suppliers },
                  { label: 'แท็ก', value: status.tags },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{thai(item.value)}</dd>
                  </div>
                ))}
              </dl>

              {status.blockedReason && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>ลบทั้งชุดไม่ได้แล้ว</AlertTitle>
                  <AlertDescription>{status.blockedReason}</AlertDescription>
                </Alert>
              )}

              <div>
                <Button
                  variant="destructive"
                  disabled={!status.canClear}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 />
                  ลบข้อมูลตัวอย่างทั้งชุด
                </Button>
              </div>
            </CardContent>
          </Card>
          {confirming && <ClearDialog status={status} onClose={() => setConfirming(false)} />}
        </>
      )}
    </div>
  );
}
