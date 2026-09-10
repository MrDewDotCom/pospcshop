import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const meQueryKey = ['auth', 'me'] as const;
export const setupStatusQueryKey = ['setup', 'status'] as const;

/** Any 401 means the session is gone (expired, logged out elsewhere, or account deactivated). */
function onApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && error.code === 'UNAUTHORIZED') {
    queryClient.setQueryData(meQueryKey, null);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only server/network failures, never 4xx answers.
      retry: (failureCount, error) =>
        failureCount < 2 &&
        (!(error instanceof ApiError) || error.status >= 500 || error.status === 0),
    },
  },
});
