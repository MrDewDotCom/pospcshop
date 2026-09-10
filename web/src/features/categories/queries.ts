import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@pcshop/shared';
import { api } from '@/lib/api';

const categoriesKey = ['categories'] as const;

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: [...categoriesKey, { includeArchived }],
    queryFn: () =>
      api
        .get<{ items: Category[] }>(`/api/categories?includeArchived=${includeArchived}`)
        .then((r) => r.items),
  });
}

function useCategoryMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export const useCreateCategory = () =>
  useCategoryMutation((input: CreateCategoryInput) => api.post<Category>('/api/categories', input));

export const useUpdateCategory = () =>
  useCategoryMutation(({ id, ...input }: UpdateCategoryInput & { id: number }) =>
    api.patch<Category>(`/api/categories/${id}`, input),
  );

export const useArchiveCategory = () =>
  useCategoryMutation(({ id, archived }: { id: number; archived: boolean }) =>
    api.post<Category>(`/api/categories/${id}/${archived ? 'archive' : 'unarchive'}`),
  );

export const useReorderCategories = () =>
  useCategoryMutation((ids: number[]) => api.put('/api/categories/order', { ids }));
