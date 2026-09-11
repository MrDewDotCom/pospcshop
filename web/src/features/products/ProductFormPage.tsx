import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { ArrowLeft, Lock } from 'lucide-react';
import {
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABELS,
  WARRANTY_TYPES,
  WARRANTY_TYPE_LABELS,
  formatWarrantyPeriod,
  parseBahtInput,
  productCoreFieldsSchema,
  productDetailFieldsSchema,
  type CreateProductInput,
  type Product,
  type ProductImage,
  type UpdateProductInput,
} from '@pcshop/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormAlert } from '@/components/FormAlert';
import { MoneyField } from '@/components/MoneyField';
import { PageHeader } from '@/components/PageHeader';
import { TextAreaField, TextField } from '@/components/TextField';
import { errorMessage, validationIssues } from '@/lib/api';
import { useCurrentUser } from '@/features/auth/queries';
import { useCategories } from '@/features/categories/queries';
import { ProductImagesEditor } from './ProductImagesEditor';
import { SpecFieldsEditor, type SpecValues } from './SpecFieldsEditor';
import { useCreateProduct, useProduct, useSetProductImages, useUpdateProduct } from './queries';

const WARRANTY_MONTH_OPTIONS = [0, 1, 3, 6, 12, 24, 36, 48, 60, 72, 84, 120];

// Number-like fields are kept as strings in the form (selects and text inputs) and converted on submit.
const formSchema = z.object({
  name: productCoreFieldsSchema.shape.name,
  brand: productCoreFieldsSchema.shape.brand,
  sku: productCoreFieldsSchema.shape.sku,
  barcode: productCoreFieldsSchema.shape.barcode,
  categoryId: z.string().min(1, { error: 'กรุณาเลือกหมวดหมู่' }),
  condition: z.enum(PRODUCT_CONDITIONS),
  warrantyType: z.enum(WARRANTY_TYPES),
  warrantyMonths: z.string(),
  supplierWarrantyMonths: z.string(),
  trackStock: z.boolean(),
  serialRequired: z.boolean(),
  minStock: z.string().regex(/^\d{1,6}$/, { error: 'กรุณากรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป' }),
  notes: productCoreFieldsSchema.shape.notes,
  description: productDetailFieldsSchema.shape.description,
  /** Owner only, when creating. Blank = "awaiting price". */
  price: z.string().refine((v) => v.trim() === '' || parseBahtInput(v) !== null, {
    error: 'กรุณากรอกราคาให้ถูกต้อง เช่น 1290 หรือ 1,290.50',
  }),
});
type FormValues = z.infer<typeof formSchema>;

function toFormValues(product: Product | undefined): FormValues {
  return {
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    categoryId: product ? String(product.categoryId) : '',
    condition: product?.condition ?? 'new',
    warrantyType: product?.warrantyType ?? 'shop',
    warrantyMonths: String(product?.warrantyMonths ?? 12),
    supplierWarrantyMonths: String(product?.supplierWarrantyMonths ?? 12),
    trackStock: product?.trackStock ?? true,
    serialRequired: product?.serialRequired ?? false,
    minStock: String(product?.minStock ?? 0),
    notes: product?.notes ?? '',
    description: product?.description ?? '',
    price: '',
  };
}

/** Form values → the API's core fields. */
function toCoreFields(values: FormValues) {
  const noWarranty = values.warrantyType === 'none';
  return {
    name: values.name,
    brand: values.brand,
    sku: values.sku,
    barcode: values.barcode,
    categoryId: Number(values.categoryId),
    condition: values.condition,
    warrantyType: values.warrantyType,
    warrantyMonths: noWarranty ? 0 : Number(values.warrantyMonths),
    supplierWarrantyMonths: Number(values.supplierWarrantyMonths),
    trackStock: values.trackStock,
    serialRequired: values.trackStock && values.serialRequired,
    minStock: Number(values.minStock),
    notes: values.notes,
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the fields that differ from the saved product, so the audit log lists real changes. */
function changedFields(product: Product, next: UpdateProductInput): UpdateProductInput {
  const current: Record<string, unknown> = { ...product, barcode: product.barcode ?? '' };
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => !sameJson(current[key], value)),
  ) as UpdateProductInput;
}

function Section({
  title,
  description,
  locked,
  children,
}: {
  title: string;
  description?: string;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {locked && <Lock className="size-4 text-muted-foreground" aria-label="แก้ไขไม่ได้" />}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  error,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** Locked text inputs are read-only (not disabled) so React Hook Form still submits their values. */
const LOCKED_INPUT = 'bg-muted text-muted-foreground';

function ProductForm({ product }: { product?: Product }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const isEdit = !!product;
  /** Staff editing an existing product: only images, description and specs (PLAN.md Q7). */
  const restricted = isEdit && !user.can('product.editCore');
  const canSetPrice = !isEdit && user.can('product.editPricing');
  const stockLocked = isEdit && product.onHand !== 0;

  const { data: categories } = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const setImages = useSetProductImages();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(product),
  });
  const [specs, setSpecs] = useState<SpecValues>(product?.specs ?? {});
  const [images, setImagesState] = useState<ProductImage[]>(product?.images ?? []);

  const e = form.formState.errors;
  const serverIssues = validationIssues(saveError);
  const err = (name: keyof FormValues | string) =>
    e[name as keyof FormValues]?.message ?? serverIssues[name];
  const locked = restricted ? LOCKED_INPUT : undefined;

  const [categoryId, warrantyType, trackStock] = useWatch({
    control: form.control,
    name: ['categoryId', 'warrantyType', 'trackStock'],
  });
  const categoryOptions = (categories ?? []).map((c) => ({ value: String(c.id), label: c.name }));
  if (product && !categoryOptions.some((o) => o.value === String(product.categoryId))) {
    categoryOptions.push({ value: String(product.categoryId), label: product.categoryName });
  }
  const kind =
    categories?.find((c) => String(c.id) === categoryId)?.kind ??
    (product && String(product.categoryId) === categoryId ? product.categoryKind : undefined);

  const monthOptions = (current: string) =>
    [...new Set([...WARRANTY_MONTH_OPTIONS, Number(current)])]
      .sort((a, b) => a - b)
      .map((m) => ({ value: String(m), label: m === 0 ? 'ไม่มี' : formatWarrantyPeriod(m) }));

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (!product) {
        const priceSatang = parseBahtInput(values.price);
        const input: CreateProductInput = {
          ...toCoreFields(values),
          description: values.description,
          specs,
          imageFileIds: images.map((i) => i.fileId),
          ...(canSetPrice && priceSatang !== null && { pricing: { priceSatang } }),
        };
        const created = await create.mutateAsync(input);
        toast.success('เพิ่มสินค้าเรียบร้อยแล้ว');
        navigate(`/products/${created.id}`, { replace: true });
        return;
      }

      const imagesChanged = !sameJson(
        images.map((i) => i.fileId),
        product.images.map((i) => i.fileId),
      );
      if (imagesChanged) {
        await setImages.mutateAsync({ id: product.id, fileIds: images.map((i) => i.fileId) });
      }
      const patch = changedFields(product, {
        ...(!restricted && toCoreFields(values)),
        description: values.description,
        specs,
      });
      if (Object.keys(patch).length > 0) await update.mutateAsync({ id: product.id, ...patch });
      toast.success(
        imagesChanged || Object.keys(patch).length > 0
          ? 'บันทึกเรียบร้อยแล้ว'
          : 'ไม่มีการเปลี่ยนแปลง',
      );
      navigate(`/products/${product.id}`);
    } catch (error) {
      setSaveError(error);
      if (Object.keys(validationIssues(error)).length > 0) toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const specErrors = Object.fromEntries(
    Object.entries(serverIssues).filter(([path]) => path.startsWith('specs.')),
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <FormAlert error={Object.keys(serverIssues).length ? null : saveError} />
      {restricted && (
        <p className="rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
          พนักงานแก้ไขได้เฉพาะรูป คำอธิบาย และสเปกของสินค้า ส่วนอื่นเจ้าของร้านเป็นผู้แก้ไข
        </p>
      )}

      <Section title="ข้อมูลหลัก" locked={restricted}>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <TextField
              label="ชื่อสินค้า"
              required
              registration={form.register('name')}
              error={err('name')}
              readOnly={restricted}
              className={locked}
              placeholder="เช่น AMD Ryzen 5 7600 (AM5)"
            />
          </div>
          <TextField
            label="ยี่ห้อ"
            registration={form.register('brand')}
            error={err('brand')}
            readOnly={restricted}
            className={locked}
          />
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <SelectField
                id="categoryId"
                label="หมวดหมู่"
                required
                value={field.value}
                onChange={field.onChange}
                options={categoryOptions}
                disabled={restricted}
                error={err('categoryId')}
                placeholder="เลือกหมวดหมู่"
              />
            )}
          />
          <TextField
            label="รหัสสินค้า (SKU)"
            registration={form.register('sku')}
            error={err('sku')}
            readOnly={restricted}
            className={locked}
            placeholder={isEdit ? undefined : 'เว้นว่างเพื่อสร้างให้อัตโนมัติ'}
            autoComplete="off"
          />
          <TextField
            label="บาร์โค้ด"
            registration={form.register('barcode')}
            error={err('barcode')}
            readOnly={restricted}
            className={locked}
            placeholder="สแกนหรือพิมพ์ (ไม่บังคับ)"
            autoComplete="off"
            // Scanners press Enter after the code; don't let that submit the form.
            onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
          />
          <Controller
            control={form.control}
            name="condition"
            render={({ field }) => (
              <SelectField
                id="condition"
                label="สภาพสินค้า"
                value={field.value}
                onChange={field.onChange}
                disabled={restricted}
                options={PRODUCT_CONDITIONS.map((c) => ({
                  value: c,
                  label: PRODUCT_CONDITION_LABELS[c],
                }))}
              />
            )}
          />
        </FieldGroup>
      </Section>

      {canSetPrice && (
        <Section
          title="ราคาขาย"
          description="เว้นว่างได้ สินค้าจะอยู่ในสถานะ “รอตั้งราคา” และยังขายไม่ได้จนกว่าจะตั้งราคา"
        >
          <div className="max-w-xs">
            <MoneyField
              label="ราคาขาย"
              registration={form.register('price')}
              error={err('price')}
            />
          </div>
        </Section>
      )}

      <Section title="สเปก" description="ช่องที่มีโล่สีฟ้าใช้ตรวจความเข้ากันได้ตอนจัดสเปกคอม">
        {kind ? (
          <SpecFieldsEditor kind={kind} value={specs} onChange={setSpecs} errors={specErrors} />
        ) : (
          <p className="text-sm text-muted-foreground">
            เลือกหมวดหมู่ก่อน แล้วช่องสเปกจะแสดงที่นี่
          </p>
        )}
      </Section>

      <Section title="รูปสินค้า">
        <ProductImagesEditor value={images} onChange={setImagesState} />
      </Section>

      <Section title="คำอธิบาย">
        <TextAreaField
          label="คำอธิบายสินค้า"
          registration={form.register('description')}
          error={err('description')}
          rows={5}
          description="แสดงในหน้าสินค้า และใช้ในข้อความโพสต์ขายได้"
        />
      </Section>

      <Section title="ประกันและสต็อก" locked={restricted}>
        <FieldGroup className="grid gap-5 md:grid-cols-3">
          <Controller
            control={form.control}
            name="warrantyType"
            render={({ field }) => (
              <SelectField
                id="warrantyType"
                label="ประเภทประกัน"
                value={field.value}
                onChange={field.onChange}
                disabled={restricted}
                options={WARRANTY_TYPES.map((t) => ({ value: t, label: WARRANTY_TYPE_LABELS[t] }))}
              />
            )}
          />
          <Controller
            control={form.control}
            name="warrantyMonths"
            render={({ field }) => (
              <SelectField
                id="warrantyMonths"
                label="ระยะประกันให้ลูกค้า"
                value={warrantyType === 'none' ? '0' : field.value}
                onChange={field.onChange}
                disabled={restricted || warrantyType === 'none'}
                options={monthOptions(field.value)}
              />
            )}
          />
          <Controller
            control={form.control}
            name="supplierWarrantyMonths"
            render={({ field }) => (
              <SelectField
                id="supplierWarrantyMonths"
                label="ประกันจากผู้จำหน่าย"
                value={field.value}
                onChange={field.onChange}
                disabled={restricted}
                options={monthOptions(field.value)}
              />
            )}
          />
          <Controller
            control={form.control}
            name="trackStock"
            render={({ field }) => (
              <Field orientation="horizontal" className="md:col-span-3">
                <Checkbox
                  id="trackStock"
                  checked={field.value}
                  disabled={restricted || stockLocked}
                  onCheckedChange={(v) => {
                    field.onChange(v === true);
                    if (v !== true) form.setValue('serialRequired', false);
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor="trackStock">นับสต็อก</FieldLabel>
                  <FieldDescription>
                    ไม่ต้องเลือกสำหรับค่าบริการ เช่น ค่าประกอบเครื่อง
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="serialRequired"
            render={({ field }) => (
              <Field orientation="horizontal" className="md:col-span-3">
                <Checkbox
                  id="serialRequired"
                  checked={field.value}
                  disabled={restricted || stockLocked || !trackStock}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="serialRequired">บังคับบันทึกซีเรียล (S/N)</FieldLabel>
                  <FieldDescription>
                    {stockLocked
                      ? `เปลี่ยนการนับสต็อก/ซีเรียลได้เมื่อคงเหลือเป็น 0 (ตอนนี้เหลือ ${product.onHand})`
                      : 'ต้องสแกนซีเรียลทุกชิ้นตอนรับเข้าและตอนขาย เหมาะกับซีพียู การ์ดจอ เมนบอร์ด'}
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
          <TextField
            label="แจ้งเตือนเมื่อเหลือไม่เกิน (ชิ้น)"
            registration={form.register('minStock')}
            error={err('minStock')}
            readOnly={restricted || !trackStock}
            className={restricted || !trackStock ? LOCKED_INPUT : undefined}
            inputMode="numeric"
          />
          <div className="md:col-span-3">
            <TextAreaField
              label="หมายเหตุภายในร้าน"
              registration={form.register('notes')}
              error={err('notes')}
              readOnly={restricted}
              className={locked}
              rows={2}
            />
          </div>
        </FieldGroup>
      </Section>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'เพิ่มสินค้า'}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={saving}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}

export function ProductCreatePage() {
  const user = useCurrentUser();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="เพิ่มสินค้า"
        description={
          user.can('product.editPricing')
            ? undefined
            : 'สินค้าที่พนักงานเพิ่มจะอยู่ในสถานะ “รอตั้งราคา” จนกว่าเจ้าของร้านจะตั้งราคา'
        }
      />
      <ProductForm />
    </div>
  );
}

export function ProductEditPage() {
  const id = Number(useParams().id);
  const { data: product, isPending, error } = useProduct(id);
  return (
    <div className="max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to={`/products/${id}`}>
          <ArrowLeft />
          กลับไปหน้าสินค้า
        </Link>
      </Button>
      <PageHeader title={product ? `แก้ไข: ${product.name}` : 'แก้ไขสินค้า'} />
      {isPending && <p className="text-muted-foreground">กำลังโหลด…</p>}
      {error && <p className="text-destructive">{errorMessage(error)}</p>}
      {product && <ProductForm key={product.id} product={product} />}
    </div>
  );
}
