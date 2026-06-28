import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export function WindowControl({
  variant = 'default',
  className,
  type = 'button',
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: 'default' | 'close';
}) {
  return (
    <button
      {...props}
      type={type}
      className={cn(
        'grid h-9 w-[46px] cursor-pointer place-items-center border-0 bg-transparent p-0 text-[var(--app-foreground-control)] transition-[color,background-color] duration-120 hover:bg-[var(--app-white-09)] hover:text-[var(--app-foreground-control-hover)]',
        variant === 'close' &&
          'hover:bg-[var(--app-close-hover)] hover:text-foreground',
        className,
      )}
    />
  );
}
