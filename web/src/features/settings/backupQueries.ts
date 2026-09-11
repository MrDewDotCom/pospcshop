import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackupInfo,
  BackupOverview,
  RestoreBackupInput,
  RestoreBackupResult,
  UpdateBackupSettingsInput,
} from '@pcshop/shared';
import { api } from '@/lib/api';

const backupsKey = ['backups'] as const;

export function useBackups() {
  return useQuery({
    queryKey: backupsKey,
    queryFn: () => api.get<BackupOverview>('/api/backups'),
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BackupInfo>('/api/backups'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: backupsKey }),
  });
}

export function useUpdateBackupSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBackupSettingsInput) => api.put('/api/backups/settings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backupsKey }),
  });
}

/** Replaces all shop data; every session ends, so the caller sends the user to the login page. */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: (input: RestoreBackupInput) =>
      api.post<RestoreBackupResult>('/api/backups/restore', input),
  });
}
