import { useState } from 'react';
import { toast } from 'sonner';
import { Ellipsis, KeyRound, Pencil, Power, UserPlus } from 'lucide-react';
import { ROLE_LABELS, type User } from '@pcshop/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { errorMessage } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/queries';
import { useUpdateUser, useUsers } from './queries';
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from './UserDialogs';

type Dialog =
  | { kind: 'edit'; user: User }
  | { kind: 'password'; user: User }
  | { kind: 'toggle'; user: User }
  | null;

export function UsersPage() {
  const me = useCurrentUser();
  const { data: users, isPending, error } = useUsers();
  const updateUser = useUpdateUser();
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const format = useFormat();

  const toggleActive = (user: User) =>
    updateUser.mutate(
      { id: user.id, isActive: !user.isActive },
      {
        onSuccess: (updated) =>
          toast.success(
            updated.isActive ? `เปิดใช้งาน ${updated.name} แล้ว` : `ปิดใช้งาน ${updated.name} แล้ว`,
          ),
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setDialog(null),
      },
    );

  return (
    <div>
      <PageHeader
        title="ผู้ใช้งาน"
        description="เพิ่มบัญชีพนักงาน กำหนดตำแหน่ง และปิดการใช้งานบัญชีที่ไม่ใช้แล้ว"
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus />
            เพิ่มผู้ใช้
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>ชื่อผู้ใช้</TableHead>
              <TableHead>ตำแหน่ง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>เข้าสู่ระบบล่าสุด</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {users?.map((user) => {
              const isSelf = user.id === me.id;
              return (
                <TableRow
                  key={user.id}
                  className={user.isActive ? undefined : 'text-muted-foreground'}
                >
                  <TableCell className="font-medium">
                    {user.name}
                    {isSelf && <span className="ml-1 text-xs text-muted-foreground">(คุณ)</span>}
                  </TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'owner' ? 'default' : 'secondary'}>
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline" className="border-green-600 text-green-700">
                        ใช้งานอยู่
                      </Badge>
                    ) : (
                      <Badge variant="outline">ปิดใช้งาน</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(user.lastLoginAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="จัดการผู้ใช้">
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', user })}>
                          <Pencil />
                          แก้ไข
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'password', user })}>
                          <KeyRound />
                          ตั้งรหัสผ่านใหม่
                        </DropdownMenuItem>
                        {!isSelf && (
                          <DropdownMenuItem
                            variant={user.isActive ? 'destructive' : 'default'}
                            onSelect={() => setDialog({ kind: 'toggle', user })}
                          >
                            <Power />
                            {user.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      {dialog?.kind === 'edit' && (
        <EditUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === me.id}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'password' && (
        <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
      <AlertDialog
        open={dialog?.kind === 'toggle'}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        {dialog?.kind === 'toggle' && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {dialog.user.isActive
                  ? `ปิดการใช้งาน ${dialog.user.name}?`
                  : `เปิดการใช้งาน ${dialog.user.name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {dialog.user.isActive
                  ? 'ผู้ใช้จะถูกออกจากระบบทันทีและเข้าสู่ระบบไม่ได้ ข้อมูลและประวัติการทำงานยังอยู่ครบ เปิดใช้งานกลับได้ทุกเมื่อ'
                  : 'ผู้ใช้จะเข้าสู่ระบบด้วยรหัสผ่านเดิมได้อีกครั้ง'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                variant={dialog.user.isActive ? 'destructive' : 'default'}
                disabled={updateUser.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  toggleActive(dialog.user);
                }}
              >
                {dialog.user.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
