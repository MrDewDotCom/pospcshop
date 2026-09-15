import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ReceiptText } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  parseBahtInput,
  satangToInput,
  shopInfoInputSchema,
  type OwnerShopSettings,
} from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { FormAlert } from '@/components/FormAlert';
import { MoneyField, bahtTextSchema } from '@/components/MoneyField';
import { PageHeader } from '@/components/PageHeader';
import { TextAreaField, TextField } from '@/components/TextField';
import { errorMessage, validationIssues } from '@/lib/api';
import { sampleSale } from '@/documents/sampleSale';
import { ReceiptDialog } from '@/features/sales/ReceiptDialog';
import { LogoUploader } from './LogoUploader';
import { useShopSettings, useSystemInfo, useUpdateSettings } from './queries';

const formSchema = shopInfoInputSchema.extend({
  receiptFooter: z.string().trim().max(500, { error: 'ยาวได้ไม่เกิน 500 ตัวอักษร' }),
  useBuddhistEra: z.boolean(),
  allowNegativeStock: z.boolean(),
  defaultAssemblyFee: bahtTextSchema,
});
type FormValues = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

function toFormValues(s: OwnerShopSettings): FormValues {
  return {
    shopName: s.shopName,
    phone: s.phone,
    address: s.address,
    lineId: s.lineId,
    promptpayId: s.promptpayId,
    receiptFooter: s.receiptFooter,
    useBuddhistEra: s.useBuddhistEra,
    allowNegativeStock: s.allowNegativeStock,
    defaultAssemblyFee: satangToInput(s.defaultAssemblyFeeSatang),
  };
}

function CheckboxField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

function SettingsForm({ settings }: { settings: OwnerShopSettings }) {
  const update = useUpdateSettings();
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    values: toFormValues(settings),
  });
  const e = form.formState.errors;
  const serverIssues = validationIssues(update.error);
  const err = (name: keyof FormValues) => e[name]?.message ?? serverIssues[name];

  const onSubmit = ({ defaultAssemblyFee, ...values }: FormOutput) =>
    update.mutate(
      { ...values, defaultAssemblyFeeSatang: parseBahtInput(defaultAssemblyFee)! },
      { onSuccess: () => toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว') },
    );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <FormAlert error={Object.keys(serverIssues).length ? null : update.error} />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลร้าน</CardTitle>
          <CardDescription>แสดงบนใบเสร็จ ใบเสนอราคา และภาพโพสต์ขาย</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <TextField
              label="ชื่อร้าน"
              required
              registration={form.register('shopName')}
              error={err('shopName')}
            />
            <TextField
              label="เบอร์โทรร้าน"
              registration={form.register('phone')}
              error={err('phone')}
              inputMode="tel"
            />
            <TextField
              label="LINE ID"
              registration={form.register('lineId')}
              error={err('lineId')}
            />
            <TextField
              label="พร้อมเพย์"
              registration={form.register('promptpayId')}
              error={err('promptpayId')}
              description="เบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก ใช้สร้าง QR รับเงิน"
              inputMode="numeric"
            />
            <div className="md:col-span-2">
              <TextAreaField
                label="ที่อยู่ร้าน"
                registration={form.register('address')}
                error={err('address')}
                rows={3}
              />
            </div>
            <div className="md:col-span-2">
              <TextAreaField
                label="ข้อความท้ายใบเสร็จ"
                registration={form.register('receiptFooter')}
                error={err('receiptFooter')}
                rows={2}
                description="เช่น เงื่อนไขการรับประกัน หรือคำขอบคุณ"
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>การทำงานของระบบ</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Controller
              control={form.control}
              name="useBuddhistEra"
              render={({ field }) => (
                <CheckboxField
                  id="useBuddhistEra"
                  label="แสดงปีเป็นพุทธศักราช (พ.ศ.)"
                  description="ใช้กับวันที่ทุกหน้าและเลขที่เอกสาร เช่น RC6909-0001"
                  checked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="allowNegativeStock"
              render={({ field }) => (
                <CheckboxField
                  id="allowNegativeStock"
                  label="อนุญาตให้ขายเกินสต็อก (สต็อกติดลบได้)"
                  description="ไม่แนะนำ ใช้เฉพาะกรณียังบันทึกรับสินค้าไม่ทัน สินค้าที่มีซีเรียลจะติดลบไม่ได้เสมอ"
                  checked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <div className="max-w-xs">
              <MoneyField
                label="ค่าประกอบเครื่องเริ่มต้น"
                registration={form.register('defaultAssemblyFee')}
                error={err('defaultAssemblyFee')}
                description="ใช้เป็นค่าเริ่มต้นเมื่อจัดสเปกเครื่อง"
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
          {update.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </Button>
      </div>
    </form>
  );
}

/** Version and data directory: what the shop should tell us when something goes wrong. */
function SystemInfoCard() {
  const { data } = useSystemInfo();
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>เกี่ยวกับระบบ</CardTitle>
        <CardDescription>
          ข้อมูลสำหรับแจ้งผู้ดูแลระบบเมื่อมีปัญหา ห้ามลบหรือย้ายโฟลเดอร์ข้อมูลเอง
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">เวอร์ชันโปรแกรม</dt>
            <dd className="font-medium">{data.version}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ระบบปฏิบัติการ</dt>
            <dd className="font-medium">{data.platform}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">โฟลเดอร์ข้อมูลของร้าน</dt>
            <dd className="font-mono text-xs break-all">{data.dataDir ?? '—'}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function ShopSettingsPage() {
  const { data, isPending, error } = useShopSettings();
  const [previewing, setPreviewing] = useState(false);
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="ข้อมูลร้าน"
        actions={
          data && (
            <Button variant="outline" onClick={() => setPreviewing(true)}>
              <ReceiptText />
              ดูตัวอย่างใบเสร็จ
            </Button>
          )
        }
      />
      {previewing && <ReceiptDialog sale={sampleSale()} onClose={() => setPreviewing(false)} />}
      {isPending && <p className="text-muted-foreground">กำลังโหลด…</p>}
      {error && <p className="text-destructive">{errorMessage(error)}</p>}
      {data && 'defaultAssemblyFeeSatang' in data && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>โลโก้ร้าน</CardTitle>
              <CardDescription>แสดงบนใบเสร็จ ใบเสนอราคา และภาพโพสต์ขาย</CardDescription>
            </CardHeader>
            <CardContent>
              <LogoUploader logoUrl={data.logoUrl} />
            </CardContent>
          </Card>
          <SettingsForm settings={data} />
          <SystemInfoCard />
        </div>
      )}
    </div>
  );
}
