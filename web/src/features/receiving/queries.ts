import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGoodsReceiptInput,
  GoodsReceipt,
  GoodsReceiptListItem,
  ListGoodsReceiptsQuery,
  Paginated,
} from '@pcshop/shared';
import { api } from '@/lib/api';

const receiptsKey = ['goods-receipts'] as const;

export function useGoodsReceipts(query: ListGoodsReceiptsQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return useQuery({
    queryKey: [...receiptsKey, 'list', query],
    queryFn: () => api.get<Paginated<GoodsReceiptListItem>>(`/api/goods-receipts?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useGoodsReceipt(id: number) {
  return useQuery({
    queryKey: [...receiptsKey, 'detail', id],
    queryFn: () => api.get<GoodsReceipt>(`/api/goods-receipts/${id}`),
  });
}

/** Receiving changes stock and average costs, so product data is refreshed too. */
export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoodsReceiptInput) =>
      api.post<GoodsReceipt>('/api/goods-receipts', input),
    onSuccess: async (receipt) => {
      queryClient.setQueryData([...receiptsKey, 'detail', receipt.id], receipt);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: receiptsKey }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
  });
}
