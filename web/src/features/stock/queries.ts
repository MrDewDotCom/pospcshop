import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListSerialsQuery,
  ListStockMovementsQuery,
  Paginated,
  SerialItem,
  SerialStatus,
  StockAdjustmentInput,
  StockAdjustmentResult,
  StockIntegrityReport,
  StockMovement,
} from '@pcshop/shared';
import { api } from '@/lib/api';

function toParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export function useStockMovements(query: ListStockMovementsQuery) {
  return useQuery({
    queryKey: ['stock', 'movements', query],
    queryFn: () => api.get<Paginated<StockMovement>>(`/api/stock/movements?${toParams(query)}`),
    placeholderData: keepPreviousData,
  });
}

/** A product's serial units. Lives under the product key so product mutations refresh it. */
export function useProductSerials(productId: number | undefined, status?: SerialStatus) {
  return useQuery({
    queryKey: ['products', 'detail', productId, 'serials', status ?? 'all'],
    queryFn: () =>
      api
        .get<Paginated<SerialItem>>(
          `/api/products/${productId}/serials${status ? `?status=${status}` : ''}`,
        )
        .then((r) => r.items),
    enabled: productId !== undefined,
  });
}

export function useSerialSearch(query: ListSerialsQuery, enabled: boolean) {
  return useQuery({
    queryKey: ['serials', query],
    queryFn: () => api.get<Paginated<SerialItem>>(`/api/serials?${toParams(query)}`),
    enabled,
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      api.post<StockAdjustmentResult>('/api/stock/adjustments', input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['serials'] }),
      ]),
  });
}

/** Owner-only integrity report; fetched on demand. */
export function useStockIntegrity() {
  return useMutation({
    mutationFn: () => api.get<StockIntegrityReport>('/api/stock/integrity'),
  });
}
