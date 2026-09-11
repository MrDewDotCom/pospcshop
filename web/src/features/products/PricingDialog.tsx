import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  applyPriceChange,
  isDiscounted,
  parseBahtInput,
  satangToInput,
  type Product,
  type ProductPricingInput,
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
import { FieldGroup } from '@/components/ui/field';
import { FormAlert } from '@/components/FormAlert';
import { MoneyField, bahtTextSchema } from '@/components/MoneyField';
import { PriceTag } from '@/components/PriceTag';
import { errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useEndDiscount, useSetProductPricing } from './queries';

const optionalBaht = z.string().refine((v) => v.trim() === '' || parseBahtInput(v) !== null, {
  error: 'กรุณากรอกจำนวนเงินให้ถูกต้อง เช่น 1290 หรือ 1,290.50',
});
const formSchema = z.object({ price: bahtTextSchema, regular: optionalBaht, cost: bahtTextSchema });
type FormValues = z.infer<typeof formSchema>;

/**
 * Owner-only pricing (PLAN.md §7.3). Leaving "ราคาปกติ" untouched applies the automatic rule: lowering
 * the price keeps the old price as the regular price, which shows the "-X%" badge.
 */
export function PricingDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const setPricing = useSetProductPricing();
  const endDiscount = useEndDiscount();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      price: product.priceSatang === null ? '' : satangToInput(product.priceSatang),
      regular: product.regularPriceSatang === null ? '' : satangToInput(product.regularPriceSatang),
      cost: satangToInput(product.costSatang ?? 0),
    },
  });
  const { errors: e, dirtyFields } = form.formState;
  const [price, regular] = useWatch({ control: form.control, name: ['price', 'regular'] });

  /** Untouched → undefined (automatic rule); blank → null (clear); otherwise the typed amount. */
  const regularChoice = (text: string) =>
    !dirtyFields.regular ? undefined : text.trim() === '' ? null : parseBahtInput(text);
  const priceSatang = parseBahtInput(price);
  const regularValid = regular.trim() === '' || parseBahtInput(regular) !== null;
  const preview =
    priceSatang !== null && regularValid
      ? applyPriceChange(product, { priceSatang, regularPriceSatang: regularChoice(regular) })
      : null;
  const autoRegular =
    !dirtyFields.regular && product.regularPriceSatang === null && !!preview?.regularPriceSatang;

  const onSubmit = (values: FormValues) => {
    const input: ProductPricingInput = { priceSatang: parseBahtInput(values.price)! };
    const nextRegular = regularChoice(values.regular);
    if (nextRegular !== undefined) input.regularPriceSatang = nextRegular;
    if (dirtyFields.cost) input.costSatang = parseBahtInput(values.cost)!;
    setPricing.mutate(
      { id: product.id, ...input },
      { onSuccess: () => (toast.success('บันทึกราคาแล้ว'), onClose()) },
    );
  };

  const onEndDiscount = () =>
    endDiscount.mutate(product.id, {
      onSuccess: () => (toast.success('ยกเลิกการลดราคาแล้ว'), onClose()),
      onError: (error) => toast.error(errorMessage(error)),
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ตั้งราคา</DialogTitle>
          <DialogDescription className="line-clamp-2">{product.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert error={setPricing.error} />
            <MoneyField
              label="ราคาขาย"
              registration={form.register('price')}
              error={e.price?.message}
            />
            <MoneyField
              label="ราคาปกติ (ก่อนลด)"
              registration={form.register('regular')}
              error={e.regular?.message}
              description="ไม่ต้องกรอกก็ได้ ถ้าลดราคาขาย ระบบจะใช้ราคาเดิมเป็นราคาปกติให้เอง"
            />
            <MoneyField
              label="ต้นทุนเฉลี่ย (เห็นเฉพาะเจ้าของร้าน)"
              registration={form.register('cost')}
              error={e.cost?.message}
              description="ปกติคำนวณจากการรับสินค้าเข้า แก้ไขเฉพาะเมื่อต้องการปรับเอง"
            />
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-1 text-xs text-muted-foreground">ลูกค้าจะเห็นราคา</div>
              {preview ? (
                <PriceTag {...preview} size="lg" />
              ) : (
                <span className="text-sm text-muted-foreground">–</span>
              )}
              {autoRegular && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ราคาเดิม {formatMoney(product.priceSatang)} จะแสดงเป็นราคาปกติ (ขีดฆ่า)
                </p>
              )}
              {isDiscounted(product) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-auto w-full py-1.5 whitespace-normal"
                  onClick={onEndDiscount}
                  disabled={endDiscount.isPending || setPricing.isPending}
                >
                  ยกเลิกลดราคา กลับเป็น {formatMoney(product.regularPriceSatang)}
                </Button>
              )}
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={setPricing.isPending || endDiscount.isPending}>
              {setPricing.isPending ? 'กำลังบันทึก…' : 'บันทึกราคา'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
