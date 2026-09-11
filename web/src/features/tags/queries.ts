import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTagInput, Tag, UpdateTagInput } from '@pcshop/shared';
import { api } from '@/lib/api';

const tagsKey = ['tags'] as const;

export function useTags(includeArchived = false) {
  return useQuery({
    queryKey: [...tagsKey, { includeArchived }],
    queryFn: () =>
      api
        .get<{ items: Tag[] }>(`/api/tags?includeArchived=${includeArchived}`)
        .then((r) => r.items),
  });
}

/** Tag changes also refresh products, since products carry their tags' names and colors. */
function useTagMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: tagsKey }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]),
  });
}

export const useCreateTag = () =>
  useTagMutation((input: CreateTagInput) => api.post<Tag>('/api/tags', input));

export const useUpdateTag = () =>
  useTagMutation(({ id, ...input }: UpdateTagInput & { id: number }) =>
    api.patch<Tag>(`/api/tags/${id}`, input),
  );

export const useArchiveTag = () =>
  useTagMutation(({ id, archived }: { id: number; archived: boolean }) =>
    api.post<Tag>(`/api/tags/${id}/${archived ? 'archive' : 'unarchive'}`),
  );

export const useReorderTags = () =>
  useTagMutation((ids: number[]) => api.put('/api/tags/order', { ids }));
