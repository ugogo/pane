import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export function ShellSurface({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'relative isolate overflow-hidden bg-[var(--app-shell-nav)] backdrop-blur-[34px] backdrop-saturate-[1.35] backdrop-brightness-[0.68]',
        className,
      )}
    />
  );
}
