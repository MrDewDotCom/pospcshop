import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProductInput,
  ListProductsQuery,
  Paginated,
  PriceHistoryEntry,
  Product,
  ProductListItem,
  ProductLookupResponse,
  ProductPricingInput,
  UpdateProductInput,
} from '@pcshop/shared';
import { ApiError, api } from '@/lib/api';

const productsKey = ['products'] as const;

function toSearchParams(query: ListProductsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export function useProducts(query: ListProductsQuery) {
  return useQuery({
    queryKey: [...productsKey, 'list', query],
    queryFn: () => api.get<Paginated<ProductListItem>>(`/api/products?${toSearchParams(query)}`),
    placeholderData: keepPreviousData,
  });
}

/**
 * Products staff created that still have no selling price (OQ3). Shown as an owner to-do on the home
 * page, because such a product can't be sold until the owner prices it.
 */
export function useAwaitingPriceCount(enabled: boolean) {
  return useQuery({
    queryKey: [...productsKey, 'list', 'awaiting-price-count'],
    queryFn: () =>
      api
        .get<Paginated<ProductListItem>>('/api/products?status=awaitingPrice&pageSize=1')
        .then((r) => r.total),
    enabled,
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: [...productsKey, 'detail', id],
    queryFn: () => api.get<Product>(`/api/products/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function usePriceHistory(id: number) {
  return useQuery({
    queryKey: [...productsKey, 'detail', id, 'price-history'],
    queryFn: () =>
      api
        .get<{ items: PriceHistoryEntry[] }>(`/api/products/${id}/price-history`)
        .then((r) => r.items),
  });
}

/**
 * Exact barcode/SKU/serial lookup for scanners (the server also fixes codes typed with the Thai
 * keyboard layout). Resolves to null when nothing matches.
 */
export async function lookupProductCode(code: string): Promise<ProductLookupResponse | null> {
  try {
    return await api.get<ProductLookupResponse>(
      `/api/products/lookup?code=${encodeURIComponent(code)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Every product mutation refreshes the product lists and details (and category/tag counts). */
function useProductMutation<T>(mutationFn: (input: T) => Promise<Product>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (product) => {
      queryClient.setQueryData([...productsKey, 'detail', product.id], product);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productsKey }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
      ]);
    },
  });
}

export const useCreateProduct = () =>
  useProductMutation((input: CreateProductInput) => api.post<Product>('/api/products', input));

export const useUpdateProduct = () =>
  useProductMutation(({ id, ...input }: UpdateProductInput & { id: number }) =>
    api.patch<Product>(`/api/products/${id}`, input),
  );

export const useSetProductImages = () =>
  useProductMutation(({ id, fileIds }: { id: number; fileIds: number[] }) =>
    api.put<Product>(`/api/products/${id}/images`, { fileIds }),
  );

export const useSetProductTags = () =>
  useProductMutation(({ id, tagIds }: { id: number; tagIds: number[] }) =>
    api.put<Product>(`/api/products/${id}/tags`, { tagIds }),
  );

export const useSetProductPricing = () =>
  useProductMutation(({ id, ...input }: ProductPricingInput & { id: number }) =>
    api.put<Product>(`/api/products/${id}/pricing`, input),
  );

export const useEndDiscount = () =>
  useProductMutation((id: number) => api.post<Product>(`/api/products/${id}/pricing/end-discount`));

export const useArchiveProduct = () =>
  useProductMutation(({ id, archived }: { id: number; archived: boolean }) =>
    api.post<Product>(`/api/products/${id}/${archived ? 'archive' : 'unarchive'}`),
  );
