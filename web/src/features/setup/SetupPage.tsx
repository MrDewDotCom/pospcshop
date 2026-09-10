import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { cn } from 'cn';
import {
  setupInputSchema,
  shopInfoInputSchema,
  type SetupStatusResponse,
  type ShopInfoInput,
} from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldGroup } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { CenteredCard } from '@/components/layout/CenteredCard';
import { FormAlert } from '@/components/FormAlert';
import { RecoveryCodeCard } from '@/components/RecoveryCodeCard';
import { TextAreaField, TextField } from '@/components/TextField';
import { validationIssues } from '@/lib/api';
import { setupStatusQueryKey } from '@/lib/queryClient';
import { useSetup } from '@/features/auth/queries';

const ownerFormSchema = setupInputSchema.shape.owner
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    path: ['confirmPassword'],
  });
type OwnerForm = z.input<typeof ownerFormSchema>;

const STEPS = ['บัญชีเจ้าของร้าน', 'ข้อมูลร้าน', 'รหัสกู้คืน'];

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-sm">
      {STEPS.map((label, index) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
              index < current && 'border-primary bg-primary text-primary-foreground',
              index === current && 'border-primary text-primary',
              index > current && 'text-muted-foreground',
            )}
          >
            {index < current ? <Check className="size-4" /> : index + 1}
          </span>
          <span className={cn('hidden sm:inline', index !== current && 'text-muted-foreground')}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function OwnerStep({
  initial,
  serverError,
  onNext,
}: {
  initial?: OwnerForm;
  serverError: unknown;
  onNext: (v: OwnerForm) => void;
}) {
  const form = useForm<OwnerForm>({
    resolver: zodResolver(ownerFormSchema),
    defaultValues: initial ?? { name: '', username: '', password: '', confirmPassword: '' },
  });
  const e = form.formState.errors;
  const serverIssues = validationIssues(serverError);

  return (
    <form onSubmit={form.handleSubmit(onNext)} noValidate>
      <FieldGroup>
        <TextField
          label="ชื่อ-นามสกุล"
          required
          registration={form.register('name')}
          error={e.name?.message ?? serverIssues['owner.name']}
          autoComplete="name"
        />
        <TextField
          label="ชื่อผู้ใช้ (สำหรับเข้าสู่ระบบ)"
          required
          registration={form.register('username')}
          error={e.username?.message ?? serverIssues['owner.username']}
          description="ภาษาอังกฤษตัวเล็กหรือตัวเลข เช่น owner หรือ somchai"
          autoComplete="username"
          autoCapitalize="none"
        />
        <TextField
          label="รหัสผ่าน"
          type="password"
          required
          registration={form.register('password')}
          error={e.password?.message ?? serverIssues['owner.password']}
          description="อย่างน้อย 8 ตัวอักษร"
          autoComplete="new-password"
        />
        <TextField
          label="ยืนยันรหัสผ่าน"
          type="password"
          required
          registration={form.register('confirmPassword')}
          error={e.confirmPassword?.message}
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full">
          ถัดไป
        </Button>
      </FieldGroup>
    </form>
  );
}

function ShopStep({
  initial,
  onBack,
  onSubmit,
  pending,
  error,
}: {
  initial?: ShopInfoInput;
  onBack: (v: ShopInfoInput) => void;
  onSubmit: (v: ShopInfoInput) => void;
  pending: boolean;
  error: unknown;
}) {
  const form = useForm<ShopInfoInput>({
    resolver: zodResolver(shopInfoInputSchema),
    defaultValues: initial ?? { shopName: '', phone: '', address: '', lineId: '', promptpayId: '' },
  });
  const e = form.formState.errors;
  // Server-side field errors (e.g. shop.promptpayId) are shown under the matching field.
  const serverIssues = validationIssues(error);
  const fieldError = (name: keyof ShopInfoInput) =>
    e[name]?.message ?? serverIssues[`shop.${name}`];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormAlert error={Object.keys(serverIssues).length ? null : error} />
        <TextField
          label="ชื่อร้าน"
          required
          registration={form.register('shopName')}
          error={fieldError('shopName')}
        />
        <TextField
          label="เบอร์โทรร้าน"
          registration={form.register('phone')}
          error={fieldError('phone')}
          inputMode="tel"
        />
        <TextAreaField
          label="ที่อยู่ร้าน"
          registration={form.register('address')}
          error={fieldError('address')}
          rows={3}
        />
        <TextField
          label="LINE ID"
          registration={form.register('lineId')}
          error={fieldError('lineId')}
        />
        <TextField
          label="พร้อมเพย์"
          registration={form.register('promptpayId')}
          error={fieldError('promptpayId')}
          description="เบอร์มือถือหรือเลขประจำตัวผู้เสียภาษี ใช้สร้าง QR รับเงินโอน (ใส่ภายหลังได้)"
          inputMode="numeric"
        />
        <p className="text-sm text-muted-foreground">
          แก้ไขข้อมูลร้านและเพิ่มโลโก้ได้ภายหลังที่หน้าตั้งค่า
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onBack(form.getValues())}
            disabled={pending}
          >
            ย้อนกลับ
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? 'กำลังบันทึก…' : 'บันทึกและสร้างบัญชี'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function RecoveryStep({
  code,
  shopName,
  onDone,
}: {
  code: string;
  shopName: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2 text-sm">
        <p>
          นี่คือ <strong>รหัสกู้คืน</strong> สำหรับตั้งรหัสผ่านใหม่ในกรณีที่เจ้าของร้านลืมรหัสผ่าน
          (ระบบนี้ทำงานแบบออฟไลน์ จึงกู้รหัสผ่านทางอีเมลไม่ได้)
        </p>
        <p className="font-medium text-destructive">
          รหัสนี้จะแสดงเพียงครั้งเดียว กรุณาจดหรือดาวน์โหลดเก็บไว้ในที่ปลอดภัย และอย่าให้พนักงานเห็น
        </p>
      </div>
      <RecoveryCodeCard code={code} shopName={shopName} />
      <div className="flex items-center gap-2">
        <Checkbox id="saved" checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        <Label htmlFor="saved">ฉันจดหรือดาวน์โหลดรหัสกู้คืนเก็บไว้แล้ว</Label>
      </div>
      <Button onClick={onDone} disabled={!saved}>
        เริ่มใช้งานระบบ
      </Button>
    </div>
  );
}

export function SetupPage() {
  const [step, setStep] = useState(0);
  const [owner, setOwner] = useState<OwnerForm>();
  const [shop, setShop] = useState<ShopInfoInput>();
  const [result, setResult] = useState<{ code: string; shopName: string }>();
  const setup = useSetup();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const submit = (shopValues: ShopInfoInput) => {
    if (!owner) return;
    setShop(shopValues);
    const { confirmPassword: _confirm, ...ownerValues } = owner;
    setup.mutate(
      { owner: ownerValues, shop: shopValues },
      {
        onSuccess: (res) => {
          setResult({ code: res.recoveryCode, shopName: shopValues.shopName });
          setStep(2);
        },
        onError: (error) => {
          // An invalid owner field (e.g. username) can only be fixed on step 1.
          if (Object.keys(validationIssues(error)).some((path) => path.startsWith('owner.'))) {
            setStep(0);
          }
        },
      },
    );
  };

  const finish = () => {
    queryClient.setQueryData<SetupStatusResponse>(setupStatusQueryKey, {
      needsSetup: false,
      shopName: result?.shopName ?? null,
    });
    navigate('/', { replace: true });
  };

  return (
    <CenteredCard
      wide
      title="ตั้งค่าร้านครั้งแรก"
      description="สร้างบัญชีเจ้าของร้านและกรอกข้อมูลร้าน ใช้เวลาไม่ถึง 2 นาที"
    >
      <StepIndicator current={step} />
      {step === 0 && (
        <OwnerStep
          initial={owner}
          serverError={setup.error}
          onNext={(values) => {
            setOwner(values);
            setStep(1);
          }}
        />
      )}
      {step === 1 && (
        <ShopStep
          initial={shop}
          pending={setup.isPending}
          error={setup.error}
          onBack={(values) => {
            setShop(values);
            setStep(0);
          }}
          onSubmit={submit}
        />
      )}
      {step === 2 && result && (
        <RecoveryStep code={result.code} shopName={result.shopName} onDone={finish} />
      )}
    </CenteredCard>
  );
}
