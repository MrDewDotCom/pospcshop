import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, type LoginInput } from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { CenteredCard } from '@/components/layout/CenteredCard';
import { FormAlert } from '@/components/FormAlert';
import { TextField } from '@/components/TextField';
import { useLogin, useSetupStatus } from './queries';

export function LoginPage() {
  const { data: status } = useSetupStatus();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { username: '', password: '' },
  });
  const e = form.formState.errors;

  const onSubmit = (values: LoginInput) =>
    login.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: () => form.resetField('password'),
    });

  return (
    <CenteredCard title="เข้าสู่ระบบ" description={status?.shopName ?? undefined}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <FormAlert error={login.error} />
          <TextField
            label="ชื่อผู้ใช้"
            registration={form.register('username')}
            error={e.username?.message}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
          />
          <TextField
            label="รหัสผ่าน"
            type="password"
            registration={form.register('password')}
            error={e.password?.message}
            autoComplete="current-password"
          />
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </Button>
          <div className="space-y-1 text-center text-sm text-muted-foreground">
            <Link to="/recover" className="underline underline-offset-4 hover:text-foreground">
              เจ้าของร้านลืมรหัสผ่าน?
            </Link>
            <p>พนักงานที่ลืมรหัสผ่าน ให้ติดต่อเจ้าของร้านเพื่อตั้งรหัสใหม่</p>
          </div>
        </FieldGroup>
      </form>
    </CenteredCard>
  );
}
