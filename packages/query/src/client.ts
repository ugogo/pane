import { QueryClient } from '@tanstack/react-query';

/** Keep fetched data warm for the whole app session (until process exit). */
const SESSION_GC_MS = 1000 * 60 * 60 * 8;

export function createPaneQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: SESSION_GC_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });
}
