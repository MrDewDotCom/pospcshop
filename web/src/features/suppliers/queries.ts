import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListSuppliersQuery,
  Paginated,
  Supplier,
  SupplierInput,
  UpdateSupplierInput,
} from '@pcshop/shared';
import { api } from '@/lib/api';

const suppliersKey = ['suppliers'] as const;

export function useSuppliers(query: ListSuppliersQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return useQuery({
    queryKey: [...suppliersKey, query],
    queryFn: () => api.get<Paginated<Supplier>>(`/api/suppliers?${params}`),
    placeholderData: keepPreviousData,
  });
}

/** Active suppliers for pickers (shops deal with a handful, so one page is enough). */
export function useSupplierOptions() {
  return useSuppliers({ pageSize: 100 });
}

function useSupplierMutation<T>(mutationFn: (input: T) => Promise<Supplier>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: suppliersKey }),
  });
}

export const useCreateSupplier = () =>
  useSupplierMutation((input: SupplierInput) => api.post<Supplier>('/api/suppliers', input));

export const useUpdateSupplier = () =>
  useSupplierMutation(({ id, ...input }: UpdateSupplierInput & { id: number }) =>
    api.patch<Supplier>(`/api/suppliers/${id}`, input),
  );

export const useArchiveSupplier = () =>
  useSupplierMutation(({ id, archived }: { id: number; archived: boolean }) =>
    api.post<Supplier>(`/api/suppliers/${id}/${archived ? 'archive' : 'unarchive'}`),
  );
