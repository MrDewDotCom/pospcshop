import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditLogItem,
  CreateUserInput,
  Paginated,
  ResetUserPasswordInput,
  UpdateUserInput,
  User,
} from '@pcshop/shared';
import { api } from '@/lib/api';

const usersKey = ['users'] as const;

export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: () => api.get<{ items: User[] }>('/api/users').then((r) => r.items),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<User>('/api/users', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: number }) =>
      api.patch<User>(`/api/users/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, ...input }: ResetUserPasswordInput & { id: number }) =>
      api.post(`/api/users/${id}/reset-password`, input),
  });
}

export function useAuditLogs(params: { page: number; pageSize: number; action?: string }) {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.action) search.set('action', params.action);
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => api.get<Paginated<AuditLogItem>>(`/api/audit-logs?${search}`),
    placeholderData: (previous) => previous,
  });
}
