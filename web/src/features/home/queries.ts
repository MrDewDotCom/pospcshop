import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  bangkokDateKey,
  bangkokMonthRange,
  type DashboardQuery,
  type DashboardSummary,
} from '@pcshop/shared';
import { api, queryString } from '@/lib/api';

export function useDashboard(range: DashboardQuery) {
  return useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => api.get<DashboardSummary>(`/api/dashboard/summary${queryString(range)}`),
    // Refetch keeps the frame: the previous numbers stay (dimmed) while a new range loads.
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const RANGE_PRESETS = ['today', '7d', 'month', 'lastMonth'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: 'วันนี้',
  '7d': '7 วันล่าสุด',
  month: 'เดือนนี้',
  lastMonth: 'เดือนที่แล้ว',
};

/** Bangkok date range ("YYYY-MM-DD", inclusive) for a preset. */
export function presetRange(preset: RangePreset, now = Date.now()): { from: string; to: string } {
  const today = bangkokDateKey(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: bangkokDateKey(now - 6 * DAY_MS), to: today };
    case 'month':
      return { from: bangkokDateKey(bangkokMonthRange(now).startMs), to: today };
    case 'lastMonth': {
      const lastMonth = bangkokMonthRange(bangkokMonthRange(now).startMs - 1);
      return { from: bangkokDateKey(lastMonth.startMs), to: bangkokDateKey(lastMonth.endMs - 1) };
    }
  }
}
