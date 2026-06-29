import type { ReactNode } from 'react';
import { MainShell } from '@/components/app-shell';
import { PaneQueryProvider } from '@/lib/query-provider';

export function MainAppLayout({ children }: { children: ReactNode }) {
  return (
    <PaneQueryProvider>
      <MainShell>{children}</MainShell>
    </PaneQueryProvider>
  );
}
