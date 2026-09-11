import { formatBaht, formatThaiDate, formatThaiDateTime } from '@pcshop/shared';
import { useShopSettings } from '@/features/settings/queries';

// Display helpers for API values (ISO timestamps, satang).

export function formatMoney(satang: number | null | undefined): string {
  return satang == null ? '–' : formatBaht(satang, { symbol: true, decimals: 'auto' });
}

/** File sizes: 950 B, 12.4 MB, 1.2 GB. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
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
