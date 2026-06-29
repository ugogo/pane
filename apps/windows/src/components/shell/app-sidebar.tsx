import type { ReactNode } from 'react';
import { ShellSurface } from '@/components/shell/shell-surface';

export function AppSidebar({ children }: { children: ReactNode }) {
  return (
    <ShellSurface className="w-[200px] shrink-0 border-r border-[var(--app-border-medium)] px-4 py-5 shadow-[inset_-1px_0_0_var(--app-black-16),inset_1px_0_0_var(--app-white-12)] max-md:w-full max-md:border-r-0 max-md:border-b max-md:border-b-[var(--app-white-09)] max-md:px-3 max-md:py-2.5 [&>*]:relative [&>*]:z-[1]">
      <nav
        aria-label="Pane modules"
        className="flex flex-col gap-1 max-md:flex-row max-md:overflow-x-auto max-md:pb-0.5"
      >
        {children}
      </nav>
    </ShellSurface>
  );
}
