import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckoutInput, ListSalesQuery, Paginated, Sale, SaleListItem } from '@pcshop/shared';
import { api, queryString } from '@/lib/api';

export const salesKey = ['sales'] as const;

export function useSales(query: ListSalesQuery) {
  return useQuery({
    queryKey: [...salesKey, 'list', query],
    queryFn: () => api.get<Paginated<SaleListItem>>(`/api/sales${queryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useSale(id: number) {
  return useQuery({
    queryKey: [...salesKey, 'detail', id],
    queryFn: () => api.get<Sale>(`/api/sales/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

/**
 * Anything that changes a sale also changes stock, serial units, and customer history, so all of
 * those are refreshed.
 */
export function useSaleMutation<T>(mutationFn: (input: T) => Promise<Sale>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (sale) => {
      queryClient.setQueryData([...salesKey, 'detail', sale.id], sale);
      await Promise.all(
        [
          salesKey,
          ['products'],
          ['stock'],
          ['serials'],
          ['customers'],
          ['returns'],
          ['dashboard'],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export const useCheckout = () =>
  useSaleMutation((input: CheckoutInput) => api.post<Sale>('/api/sales', input));
