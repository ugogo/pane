import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createPaneQueryClient } from '@pane/query';

export function PaneQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createPaneQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
