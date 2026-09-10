import { formatThaiDate, formatThaiDateTime, formatBaht } from '@pcshop/shared';

// Display helpers for API values (ISO timestamps, satang). The Buddhist Era setting is wired in
// with the shop settings (sub-task 6); until then B.E. is used, which is the shop default.

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? formatThaiDateTime(Date.parse(iso)) : '–';
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? formatThaiDate(Date.parse(iso)) : '–';
}

export function formatMoney(satang: number | null | undefined): string {
  return satang == null ? '–' : formatBaht(satang, { symbol: true, decimals: 'auto' });
}
