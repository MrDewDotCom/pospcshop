import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClearSampleDataResult, SampleDataStatus } from '@pcshop/shared';
import { api } from '@/lib/api';

const sampleDataKey = ['seed', 'status'] as const;

export function useSampleData() {
  return useQuery({
    queryKey: sampleDataKey,
    queryFn: () => api.get<SampleDataStatus>('/api/seed/status'),
  });
}

/** Deletes the sample rows; products, stock, tags and suppliers all change, so the cache is emptied. */
export function useClearSampleData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ClearSampleDataResult>('/api/seed/clear'),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
