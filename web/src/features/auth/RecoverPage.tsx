import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { recoverInputSchema } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { CenteredCard } from '@/components/layout/CenteredCard';
import { FormAlert } from '@/components/FormAlert';
import { RecoveryCodeCard } from '@/components/RecoveryCodeCard';
import { TextField } from '@/components/TextField';
import { useRecover, useSetupStatus } from './queries';

const recoverFormSchema = recoverInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, {
    error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    path: ['confirmPassword'],
  });
type RecoverForm = z.input<typeof recoverFormSchema>;

export function RecoverPage() {
  const { data: status } = useSetupStatus();
  const recover = useRecover();
  const [newCode, setNewCode] = useState<string>();

  const form = useForm<RecoverForm>({
    resolver: zodResolver(recoverFormSchema),
    defaultValues: { username: '', recoveryCode: '', newPassword: '', confirmPassword: '' },
  });
  const e = form.formState.errors;

  if (newCode) {
    return (
      <CenteredCard wide title="ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว">
        <div className="flex flex-col gap-5 text-sm">
          <p>
            รหัสกู้คืนเดิมใช้ไม่ได้แล้ว นี่คือ <strong>รหัสกู้คืนใหม่</strong>{' '}
            กรุณาจดหรือดาวน์โหลดเก็บไว้ เพราะจะแสดงเพียงครั้งเดียว
          </p>
          <RecoveryCodeCard code={newCode} shopName={status?.shopName ?? ''} />
          <Button asChild>
            <Link to="/login">ไปหน้าเข้าสู่ระบบ</Link>
          </Button>
        </div>
      </CenteredCard>
    );
  }

  const onSubmit = ({ confirmPassword: _confirm, ...values }: RecoverForm) =>
    recover.mutate(values, { onSuccess: (res) => setNewCode(res.recoveryCode) });

  return (
    <CenteredCard
      title="ตั้งรหัสผ่านเจ้าของร้านใหม่"
      description="ใช้รหัสกู้คืนที่ได้รับตอนตั้งค่าร้านครั้งแรก"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <FormAlert error={recover.error} />
          <TextField
            label="ชื่อผู้ใช้ของเจ้าของร้าน"
            registration={form.register('username')}
            error={e.username?.message}
            autoComplete="username"
            autoCapitalize="none"
          />
          <TextField
            label="รหัสกู้คืน"
            registration={form.register('recoveryCode')}
            error={e.recoveryCode?.message}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase"
          />
          <TextField
            label="รหัสผ่านใหม่"
            type="password"
            registration={form.register('newPassword')}
            error={e.newPassword?.message}
            description="อย่างน้อย 8 ตัวอักษร"
            autoComplete="new-password"
          />
          <TextField
            label="ยืนยันรหัสผ่านใหม่"
            type="password"
            registration={form.register('confirmPassword')}
            error={e.confirmPassword?.message}
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={recover.isPending}>
            {recover.isPending ? 'กำลังตรวจสอบ…' : 'ตั้งรหัสผ่านใหม่'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ไม่มีรหัสกู้คืน? ดูวิธีรีเซ็ตรหัสผ่านจากเครื่องหลักในคู่มือการใช้งาน ·{' '}
            <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
              กลับ
            </Link>
          </p>
        </FieldGroup>
      </form>
    </CenteredCard>
  );
}
