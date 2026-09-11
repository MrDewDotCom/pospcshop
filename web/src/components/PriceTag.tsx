import { cn } from 'cn';
import { discountBadgeLabel, type PriceState } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';

/** The "-20%" discount badge (rounded down), or nothing when the price isn't reduced. */
export function DiscountBadge({ className, ...state }: PriceState & { className?: string }) {
  const label = discountBadgeLabel(state);
  if (!label) return null;
  return <Badge className={cn('bg-red-600 text-white tabular-nums', className)}>{label}</Badge>;
}

/**
 * A product price everywhere in the app: the selling price, the struck-through regular price and the
 * "-X%" badge when it's reduced, or "รอตั้งราคา" when the owner hasn't set a price yet.
 */
export function PriceTag({
  priceSatang,
  regularPriceSatang,
  size = 'md',
  className,
}: PriceState & { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  if (priceSatang === null) {
    return (
      <Badge
        variant="outline"
        className={cn('border-amber-300 bg-amber-50 text-amber-800', className)}
      >
        รอตั้งราคา
      </Badge>
    );
  }
  const discounted = discountBadgeLabel({ priceSatang, regularPriceSatang }) !== null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5', className)}>
      <span
        className={cn(
          'font-semibold tabular-nums',
          size === 'lg' && 'text-2xl',
          size === 'sm' && 'text-sm',
          discounted && 'text-red-600',
        )}
      >
        {formatMoney(priceSatang)}
      </span>
      {discounted && (
        <>
          <s
            className={cn(
              'text-muted-foreground tabular-nums',
              size === 'lg' ? 'text-base' : 'text-xs',
            )}
          >
            {formatMoney(regularPriceSatang)}
          </s>
          <DiscountBadge priceSatang={priceSatang} regularPriceSatang={regularPriceSatang} />
        </>
      )}
    </span>
  );
}
