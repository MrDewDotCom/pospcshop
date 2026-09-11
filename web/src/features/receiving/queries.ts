import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGoodsReceiptInput,
  GoodsReceipt,
  GoodsReceiptListItem,
  ListGoodsReceiptsQuery,
  Paginated,
  VerifyGoodsReceiptCostsInput,
  VoidInput,
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

/** Receipts change stock and average costs, so product data is refreshed too. */
function useReceiptMutation<T>(mutationFn: (input: T) => Promise<GoodsReceipt>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (receipt) => {
      queryClient.setQueryData([...receiptsKey, 'detail', receipt.id], receipt);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: receiptsKey }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['serials'] }),
      ]);
    },
  });
}

export const useCreateGoodsReceipt = () =>
  useReceiptMutation((input: CreateGoodsReceiptInput) =>
    api.post<GoodsReceipt>('/api/goods-receipts', input),
  );

export const useVerifyReceiptCosts = () =>
  useReceiptMutation(({ id, ...input }: VerifyGoodsReceiptCostsInput & { id: number }) =>
    api.post<GoodsReceipt>(`/api/goods-receipts/${id}/verify-costs`, input),
  );

export const useVoidReceipt = () =>
  useReceiptMutation(({ id, ...input }: VoidInput & { id: number }) =>
    api.post<GoodsReceipt>(`/api/goods-receipts/${id}/void`, input),
  );

/** How many receipts wait for the owner's cost review (home page badge). */
export function useUnverifiedReceiptCount(enabled: boolean) {
  return useQuery({
    queryKey: [...receiptsKey, 'list', 'unverified-count'],
    queryFn: () =>
      api
        .get<Paginated<GoodsReceiptListItem>>(
          '/api/goods-receipts?costStatus=unverified&status=posted&pageSize=1',
        )
        .then((r) => r.total),
    enabled,
  });
}
