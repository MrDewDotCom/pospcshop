import { formatBaht, formatThaiDate, formatThaiDateTime } from '@pcshop/shared';
import { useShopSettings } from '@/features/settings/queries';

// Display helpers for API values (ISO timestamps, satang).

export function formatMoney(satang: number | null | undefined): string {
  return satang == null ? '–' : formatBaht(satang, { symbol: true, decimals: 'auto' });
}

/** Date formatters that follow the shop's Buddhist Era setting (B.E. until settings load). */
export function useFormat() {
  const { data: settings } = useShopSettings();
  const buddhistEra = settings?.useBuddhistEra ?? true;
  return {
    dateTime: (iso: string | null | undefined) =>
      iso ? formatThaiDateTime(Date.parse(iso), { buddhistEra }) : '–',
    date: (iso: string | null | undefined) =>
      iso ? formatThaiDate(Date.parse(iso), { buddhistEra }) : '–',
    money: formatMoney,
  };
}
