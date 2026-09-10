import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  can,
  type ChangePasswordInput,
  type LoginInput,
  type MeResponse,
  type Permission,
  type RecoverInput,
  type RecoverResponse,
  type SetupInput,
  type SetupResponse,
  type SetupStatusResponse,
} from '@pcshop/shared';
import { ApiError, api } from '@/lib/api';
import { meQueryKey, setupStatusQueryKey } from '@/lib/queryClient';

export function useSetupStatus() {
  return useQuery({
    queryKey: setupStatusQueryKey,
    queryFn: () => api.get<SetupStatusResponse>('/api/setup/status'),
    staleTime: Infinity,
  });
}

/** The logged-in user, or null when there is no valid session. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/api/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

/** For components inside the logged-in area (RequireAuth guarantees the user exists). */
export function useCurrentUser() {
  const { data } = useMe();
  if (!data) throw new Error('useCurrentUser must be used inside <RequireAuth>');
  return {
    ...data.user,
    can: (permission: Permission) => can(data.user.role, permission),
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<MeResponse>('/api/auth/login', input),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSettled: () => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'setup' });
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}

/**
 * Setup deliberately does NOT refresh the setup status: the wizard must stay on screen to show the
 * recovery code. The wizard marks setup as done when the owner continues.
 */
export function useSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetupInput) => api.post<SetupResponse>('/api/setup', input),
    onSuccess: ({ user, permissions }) =>
      queryClient.setQueryData<MeResponse>(meQueryKey, { user, permissions }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/api/auth/change-password', input),
  });
}

export function useRecover() {
  return useMutation({
    mutationFn: (input: RecoverInput) => api.post<RecoverResponse>('/api/auth/recover', input),
  });
}
