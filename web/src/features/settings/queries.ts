import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DocType,
  DocumentSequence,
  NetworkInfoResponse,
  OwnerShopSettings,
  ShopSettings,
  SystemInfoResponse,
  UpdateDocumentSequenceInput,
  UpdateShopSettingsInput,
} from '@pcshop/shared';
import { api } from '@/lib/api';
import { setupStatusQueryKey } from '@/lib/queryClient';

export const settingsKey = ['settings'] as const;
const sequencesKey = ['settings', 'sequences'] as const;

/** Shop details for everyone (staff get a narrower shape without owner-only fields). */
export function useShopSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api.get<ShopSettings>('/api/settings'),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateShopSettingsInput) =>
      api.patch<OwnerShopSettings>('/api/settings', input),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings);
      // The shop name also appears in the header and on the login page.
      void queryClient.invalidateQueries({ queryKey: setupStatusQueryKey });
      void queryClient.invalidateQueries({ queryKey: sequencesKey });
    },
  });
}

export function useSequences() {
  return useQuery({
    queryKey: sequencesKey,
    queryFn: () =>
      api.get<{ items: DocumentSequence[] }>('/api/settings/sequences').then((r) => r.items),
  });
}

export function useUpdateSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docType, ...input }: UpdateDocumentSequenceInput & { docType: DocType }) =>
      api.patch<DocumentSequence>(`/api/settings/sequences/${docType}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sequencesKey }),
  });
}

export function useNetworkInfo() {
  return useQuery({
    queryKey: ['system', 'network'],
    queryFn: () => api.get<NetworkInfoResponse>('/api/system/network'),
  });
}

/** Version and data directory (owner only); useful when the shop asks for support. */
export function useSystemInfo() {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfoResponse>('/api/system/info'),
    staleTime: Infinity,
  });
}
