import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import {
  DOC_TYPE_LABELS,
  SEQUENCE_RESET_POLICIES,
  SEQUENCE_RESET_POLICY_LABELS,
  formatDocNumber,
  toBangkokParts,
  updateDocumentSequenceInputSchema,
  validateDocFormat,
  type DocumentSequence,
  type UpdateDocumentSequenceInput,
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useSequences, useShopSettings, useUpdateSequence } from './queries';

const TOKEN_HELP: [string, string][] = [
  ['{YYYY}', 'ปี 4 หลัก เช่น 2569'],
  ['{YY}', 'ปี 2 หลัก เช่น 69'],
  ['{MM}', 'เดือน เช่น 09'],
  ['{DD}', 'วันที่ เช่น 10'],
  ['{SEQ:4}', 'เลขลำดับ 4 หลัก เช่น 0001'],
];

function EditSequenceDialog({
  sequence,
  onClose,
}: {
  sequence: DocumentSequence;
  onClose: () => void;
}) {
  const update = useUpdateSequence();
  const { data: settings } = useShopSettings();
  const [now] = useState(() => Date.now());
  const form = useForm<UpdateDocumentSequenceInput>({
    resolver: zodResolver(updateDocumentSequenceInputSchema),
    defaultValues: { format: sequence.format, resetPolicy: sequence.resetPolicy },
  });
  const [format, resetPolicy] = useWatch({
    control: form.control,
    name: ['format', 'resetPolicy'],
  });
  const problem = validateDocFormat(format, resetPolicy);
  const preview = problem
    ? null
    : formatDocNumber(format, {
        seq: 1,
        parts: toBangkokParts(now),
        buddhistEra: settings?.useBuddhistEra ?? true,
      });

  const onSubmit = (values: UpdateDocumentSequenceInput) =>
    update.mutate(
      { docType: sequence.docType, ...values },
      {
        onSuccess: () => {
          toast.success('บันทึกรูปแบบเลขที่เอกสารแล้ว');
          onClose();
        },
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>รูปแบบเลขที่{DOC_TYPE_LABELS[sequence.docType]}</DialogTitle>
          <DialogDescription>
            เลขที่เอกสารที่ออกไปแล้วจะไม่เปลี่ยน รูปแบบใหม่ใช้กับเอกสารใบถัดไป
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={update.error} />
            <TextField
              label="รูปแบบ"
              registration={form.register('format')}
              error={
                form.formState.errors.format?.message ??
                (form.formState.isDirty ? (problem ?? undefined) : undefined)
              }
              className="font-mono"
              autoComplete="off"
            />
            <Controller
              control={form.control}
              name="resetPolicy"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="resetPolicy">การนับเลขลำดับ</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="resetPolicy" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEQUENCE_RESET_POLICIES.map((policy) => (
                        <SelectItem key={policy} value={policy}>
                          {SEQUENCE_RESET_POLICY_LABELS[policy]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="mb-2">
                ตัวอย่างเลขที่: <span className="font-mono font-semibold">{preview ?? '–'}</span>
              </div>
              <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-muted-foreground">
                {TOKEN_HELP.map(([token, meaning]) => (
                  <div key={token} className="contents">
                    <dt className="font-mono">{token}</dt>
                    <dd>{meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={update.isPending || !!problem}>
              {update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NumberingPage() {
  const { data, isPending, error } = useSequences();
  const [editing, setEditing] = useState<DocumentSequence | null>(null);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="เลขที่เอกสาร"
        description="ระบบออกเลขที่เอกสารให้อัตโนมัติ เรียงต่อกัน ไม่ซ้ำ ไม่ข้าม"
      />
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เอกสาร</TableHead>
              <TableHead>รูปแบบ</TableHead>
              <TableHead>การนับ</TableHead>
              <TableHead>เลขที่ใบถัดไป</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  กำลังโหลด…
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  {errorMessage(error)}
                </TableCell>
              </TableRow>
            )}
            {data?.map((sequence) => (
              <TableRow key={sequence.docType}>
                <TableCell className="font-medium">{DOC_TYPE_LABELS[sequence.docType]}</TableCell>
                <TableCell className="font-mono">{sequence.format}</TableCell>
                <TableCell>{SEQUENCE_RESET_POLICY_LABELS[sequence.resetPolicy]}</TableCell>
                <TableCell className="font-mono">{sequence.nextNumberPreview}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="แก้ไข"
                    onClick={() => setEditing(sequence)}
                  >
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <EditSequenceDialog sequence={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
