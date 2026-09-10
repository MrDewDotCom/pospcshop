import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ROLES,
  ROLE_LABELS,
  createUserInputSchema,
  minPasswordLength,
  resetUserPasswordInputSchema,
  updateUserInputSchema,
  type Role,
  type User,
} from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormAlert } from '@/components/FormAlert';
import { TextField } from '@/components/TextField';
import { validationIssues } from '@/lib/api';
import { useCreateUser, useResetUserPassword, useUpdateUser } from './queries';

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'เห็นและทำได้ทุกอย่าง รวมถึงต้นทุน กำไร และการตั้งค่าร้าน',
  staff: 'ขาย รับสินค้า จัดสเปก ทำโพสต์ได้ แต่ไม่เห็นต้นทุนและแก้ราคาไม่ได้',
};

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="role">ตำแหน่ง</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
        <SelectTrigger id="role" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{ROLE_DESCRIPTIONS[value]}</FieldDescription>
    </Field>
  );
}

const createFormSchema = createUserInputSchema.refine(
  (v) => v.password.length >= minPasswordLength(v.role),
  { error: 'รหัสผ่านของเจ้าของร้านต้องมีอย่างน้อย 8 ตัวอักษร', path: ['password'] },
);
type CreateForm = z.input<typeof createFormSchema>;

export function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createUser = useCreateUser();
  const form = useForm<CreateForm>({
    resolver: zodResolver(createFormSchema),
    defaultValues: { name: '', username: '', password: '', role: 'staff' },
  });
  const e = form.formState.errors;
  const serverIssues = validationIssues(createUser.error);

  const close = (next: boolean) => {
    if (!next) {
      form.reset();
      createUser.reset();
    }
    onOpenChange(next);
  };

  const onSubmit = (values: CreateForm) =>
    createUser.mutate(values, {
      onSuccess: (user) => {
        toast.success(`เพิ่มผู้ใช้ ${user.name} เรียบร้อยแล้ว`);
        close(false);
      },
    });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่มผู้ใช้</DialogTitle>
          <DialogDescription>
            แจ้งชื่อผู้ใช้และรหัสผ่านให้พนักงาน แล้วให้เปลี่ยนรหัสเองที่หน้าบัญชีของฉัน
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={Object.keys(serverIssues).length ? null : createUser.error} />
            <TextField
              label="ชื่อ"
              required
              registration={form.register('name')}
              error={e.name?.message ?? serverIssues.name}
            />
            <TextField
              label="ชื่อผู้ใช้"
              required
              registration={form.register('username')}
              error={e.username?.message ?? serverIssues.username}
              description="ภาษาอังกฤษตัวเล็กหรือตัวเลข 3–32 ตัว"
              autoCapitalize="none"
              autoComplete="off"
            />
            <TextField
              label="รหัสผ่านเริ่มต้น"
              type="password"
              required
              registration={form.register('password')}
              error={e.password?.message ?? serverIssues.password}
              autoComplete="new-password"
            />
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => <RoleSelect value={field.value} onChange={field.onChange} />}
            />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'กำลังบันทึก…' : 'เพิ่มผู้ใช้'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const editFormSchema = updateUserInputSchema
  .required({ name: true, role: true })
  .omit({ isActive: true });
type EditForm = z.input<typeof editFormSchema>;

export function EditUserDialog({
  user,
  isSelf,
  onClose,
}: {
  user: User;
  isSelf: boolean;
  onClose: () => void;
}) {
  const updateUser = useUpdateUser();
  const form = useForm<EditForm>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { name: user.name, role: user.role },
  });

  const onSubmit = (values: EditForm) =>
    updateUser.mutate(
      { id: user.id, ...values },
      {
        onSuccess: () => {
          toast.success('บันทึกข้อมูลผู้ใช้เรียบร้อยแล้ว');
          onClose();
        },
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แก้ไขผู้ใช้</DialogTitle>
          <DialogDescription>ชื่อผู้ใช้สำหรับเข้าสู่ระบบ: {user.username}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={updateUser.error} />
            <TextField
              label="ชื่อ"
              required
              registration={form.register('name')}
              error={form.formState.errors.name?.message}
            />
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <RoleSelect value={field.value} onChange={field.onChange} disabled={isSelf} />
              )}
            />
            {isSelf && <FieldError>ไม่สามารถเปลี่ยนตำแหน่งของบัญชีตัวเองได้</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const resetPassword = useResetUserPassword();
  const minLength = minPasswordLength(user.role);
  const formSchema = resetUserPasswordInputSchema
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
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const e = form.formState.errors;

  const onSubmit = ({ newPassword }: FormValues) =>
    resetPassword.mutate(
      { id: user.id, newPassword },
      {
        onSuccess: () => {
          toast.success(`ตั้งรหัสผ่านใหม่ให้ ${user.name} แล้ว`);
          onClose();
        },
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ตั้งรหัสผ่านใหม่ให้ {user.name}</DialogTitle>
          <DialogDescription>
            ผู้ใช้จะถูกออกจากระบบทุกเครื่อง และต้องเข้าสู่ระบบด้วยรหัสผ่านใหม่
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={resetPassword.error} />
            <TextField
              label="รหัสผ่านใหม่"
              type="password"
              registration={form.register('newPassword')}
              error={e.newPassword?.message}
              description={`อย่างน้อย ${minLength} ตัวอักษร`}
              autoComplete="new-password"
            />
            <TextField
              label="ยืนยันรหัสผ่านใหม่"
              type="password"
              registration={form.register('confirmPassword')}
              error={e.confirmPassword?.message}
              autoComplete="new-password"
            />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
