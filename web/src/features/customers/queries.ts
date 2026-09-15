import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CustomerHistory,
  CustomerInput,
  CustomerListItem,
  CustomerPhoneMatch,
  ListCustomersQuery,
  Paginated,
  UpdateCustomerInput,
} from '@pcshop/shared';
import { normalizePhone } from '@pcshop/shared';
import { api, queryString } from '@/lib/api';

const customersKey = ['customers'] as const;

export function useCustomers(query: ListCustomersQuery, enabled = true) {
  return useQuery({
    queryKey: [...customersKey, 'list', query],
    queryFn: () => api.get<Paginated<CustomerListItem>>(`/api/customers${queryString(query)}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: [...customersKey, 'detail', id],
    queryFn: () => api.get<CustomerListItem>(`/api/customers/${id}`),
  });
}

export function useCustomerHistory(id: number) {
  return useQuery({
    queryKey: [...customersKey, 'history', id],
    queryFn: () => api.get<CustomerHistory>(`/api/customers/${id}/history`),
  });
}

/** Existing customers with the same phone number (a warning in the form, never a block). */
export function useCustomerPhoneMatches(phone: string, excludeId?: number) {
  const normalized = normalizePhone(phone);
  return useQuery({
    queryKey: [...customersKey, 'phone-matches', normalized, excludeId],
    queryFn: () =>
      api
        .get<{
          items: CustomerPhoneMatch[];
        }>(`/api/customers/phone-matches${queryString({ phone: normalized, excludeId })}`)
        .then((r) => r.items),
    enabled: normalized.length >= 6,
  });
}

function useCustomerMutation<T>(mutationFn: (input: T) => Promise<CustomerListItem>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  });
}

export const useCreateCustomer = () =>
  useCustomerMutation((input: CustomerInput) =>
    api.post<CustomerListItem>('/api/customers', input),
  );

export const useUpdateCustomer = () =>
  useCustomerMutation(({ id, ...input }: UpdateCustomerInput & { id: number }) =>
    api.patch<CustomerListItem>(`/api/customers/${id}`, input),
  );

export const useArchiveCustomer = () =>
  useCustomerMutation(({ id, archived }: { id: number; archived: boolean }) =>
    api.post<CustomerListItem>(`/api/customers/${id}/${archived ? 'archive' : 'unarchive'}`),
  );
