import { cn } from 'cn';
import type { AutoTag, AutoTagKey, AutoTagTone, ProductTagChip, TagColor } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';

/** Classes per custom tag color (full class names so Tailwind picks them up). */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: 'border-slate-300 bg-slate-100 text-slate-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  green: 'border-green-200 bg-green-50 text-green-700',
  teal: 'border-teal-200 bg-teal-50 text-teal-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  pink: 'border-pink-200 bg-pink-50 text-pink-700',
};

/** Solid swatch per color, for the color picker. */
export const TAG_SWATCH_CLASSES: Record<TagColor, string> = {
  gray: 'bg-slate-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  teal: 'bg-teal-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
};

const TONE_CLASSES: Record<AutoTagTone, string> = {
  neutral: 'border-border bg-background text-foreground',
  muted: 'border-border bg-muted text-muted-foreground',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  discount: 'border-transparent bg-red-600 text-white tabular-nums',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

export function CustomTagChip({ tag, className }: { tag: ProductTagChip; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TAG_COLOR_CLASSES[tag.color], className)}>
      {tag.name}
    </Badge>
  );
}

/**
 * A product's tag chips: automatic tags (condition, warranty, discount, stock, …) followed by the
 * owner's custom tags. Use `hide` for tags that are already shown next to it (e.g. the discount badge
 * inside PriceTag).
 */
export function ProductTags({
  product,
  hide = [],
  className,
}: {
  product: { autoTags: AutoTag[]; tags: ProductTagChip[] };
  hide?: AutoTagKey[];
  className?: string;
}) {
  const autoTags = product.autoTags.filter((tag) => !hide.includes(tag.key));
  if (autoTags.length === 0 && product.tags.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {autoTags.map((tag) => (
        <Badge key={tag.key} variant="outline" className={TONE_CLASSES[tag.tone]}>
          {tag.label}
        </Badge>
      ))}
      {product.tags.map((tag) => (
        <CustomTagChip key={tag.id} tag={tag} />
      ))}
    </div>
  );
}
