import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReturnInput,
  ListReturnsQuery,
  Paginated,
  ResolveReturnItemInput,
  ReturnListItem,
  SaleReturn,
  UpdateReturnRefundInput,
} from '@pcshop/shared';
import { api, queryString } from '@/lib/api';

const returnsKey = ['returns'] as const;

export function useReturns(query: ListReturnsQuery) {
  return useQuery({
    queryKey: [...returnsKey, 'list', query],
    queryFn: () => api.get<Paginated<ReturnListItem>>(`/api/returns${queryString(query)}`),
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: number) {
  return useQuery({
    queryKey: [...returnsKey, 'detail', id],
    queryFn: () => api.get<SaleReturn>(`/api/returns/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

/** Returns touch the sale (refunds, returned quantities), serial units, stock, and product tags. */
function useReturnMutation<T>(mutationFn: (input: T) => Promise<SaleReturn>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (ret) => {
      queryClient.setQueryData([...returnsKey, 'detail', ret.id], ret);
      await Promise.all(
        [
          returnsKey,
          ['sales'],
          ['products'],
          ['stock'],
          ['serials'],
          ['customers'],
          ['dashboard'],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export const useCreateReturn = () =>
  useReturnMutation(({ saleId, ...input }: CreateReturnInput & { saleId: number }) =>
    api.post<SaleReturn>(`/api/sales/${saleId}/returns`, input),
  );

export const useUpdateRefund = () =>
  useReturnMutation(({ id, ...input }: UpdateReturnRefundInput & { id: number }) =>
    api.patch<SaleReturn>(`/api/returns/${id}/refund`, input),
  );

export const useResolveReturnItem = () =>
  useReturnMutation(
    ({ id, itemId, ...input }: ResolveReturnItemInput & { id: number; itemId: number }) =>
      api.post<SaleReturn>(`/api/returns/${id}/items/${itemId}/resolve`, input),
  );
