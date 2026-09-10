import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { changePasswordInputSchema, minPasswordLength, ROLE_LABELS } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { FormAlert } from '@/components/FormAlert';
import { TextField } from '@/components/TextField';
import { useChangePassword, useCurrentUser } from './queries';

export function AccountPage() {
  const user = useCurrentUser();
  const changePassword = useChangePassword();
  const minLength = minPasswordLength(user.role);

  const formSchema = changePasswordInputSchema
    .extend({ confirmPassword: z.string() })
    .refine((v) => v.newPassword.length >= minLength, {
      error: `รหัสผ่านต้องมีอย่างน้อย ${minLength} ตัวอักษร`,
      path: ['newPassword'],
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
      path: ['confirmPassword'],
    });
  type FormValues = z.input<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const e = form.formState.errors;

  const onSubmit = ({ confirmPassword: _confirm, ...values }: FormValues) =>
    changePassword.mutate(values, {
      onSuccess: () => {
        form.reset();
        toast.success(
          'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว อุปกรณ์อื่นที่ใช้บัญชีนี้จะต้องเข้าสู่ระบบใหม่',
        );
      },
    });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">บัญชีของฉัน</h1>

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลผู้ใช้</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">ชื่อ</dt>
            <dd>{user.name}</dd>
            <dt className="text-muted-foreground">ชื่อผู้ใช้</dt>
            <dd>{user.username}</dd>
            <dt className="text-muted-foreground">ตำแหน่ง</dt>
            <dd>{ROLE_LABELS[user.role]}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>เปลี่ยนรหัสผ่าน</CardTitle>
          <CardDescription>รหัสผ่านใหม่ต้องมีอย่างน้อย {minLength} ตัวอักษร</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormAlert error={changePassword.error} />
              <TextField
                label="รหัสผ่านปัจจุบัน"
                type="password"
                registration={form.register('currentPassword')}
                error={e.currentPassword?.message}
                autoComplete="current-password"
              />
              <TextField
                label="รหัสผ่านใหม่"
                type="password"
                registration={form.register('newPassword')}
                error={e.newPassword?.message}
                autoComplete="new-password"
              />
              <TextField
                label="ยืนยันรหัสผ่านใหม่"
                type="password"
                registration={form.register('confirmPassword')}
                error={e.confirmPassword?.message}
                autoComplete="new-password"
              />
              <Button type="submit" disabled={changePassword.isPending} className="self-start">
                {changePassword.isPending ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
