import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export function EditorToggleButton({
  size,
  className,
  type = 'button',
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  size: 'tool' | 'icon' | 'swatch';
}) {
  return (
    <button
      {...props}
      type={type}
      className={cn(
        'flex cursor-pointer items-center justify-center border border-border bg-secondary text-muted-foreground transition-[background-color,border-color,color] duration-120 ease-in-out hover:enabled:bg-accent hover:enabled:text-foreground aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-foreground disabled:cursor-default disabled:opacity-45',
        size === 'tool' && 'aspect-square w-full rounded-lg',
        size === 'icon' && 'h-[30px] w-[34px] rounded-lg',
        size === 'swatch' &&
          'size-7 rounded-full shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--secondary)_52%,transparent)] aria-pressed:border-foreground aria-pressed:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--secondary)_52%,transparent),0_0_0_2px_var(--ring)]',
        className,
      )}
    />
  );
}
