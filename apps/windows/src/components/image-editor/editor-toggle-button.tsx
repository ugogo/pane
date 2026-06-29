import type { ComponentPropsWithoutRef } from 'react';
import { Button } from 'pickle-ui';
import { cn } from '@/lib/cn';

export function EditorToggleButton({
  size,
  className,
  type = 'button',
  'aria-pressed': ariaPressed,
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  size: 'tool' | 'icon' | 'swatch';
}) {
  const pressed = ariaPressed === true || ariaPressed === 'true';

  return (
    <Button
      {...props}
      type={type}
      aria-pressed={ariaPressed}
      variant={size === 'swatch' || !pressed ? 'secondary' : 'primary'}
      size="sm"
      className={cn(
        size === 'tool' && 'aspect-square w-full',
        size === 'swatch' && 'size-7 rounded-full',
        className,
      )}
    />
  );
}
