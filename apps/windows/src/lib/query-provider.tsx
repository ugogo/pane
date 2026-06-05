import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { usePaneQueryClient } from '@pane/query';

export function PaneQueryProvider({ children }: { children: ReactNode }) {
  const client = usePaneQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
