import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Thin styled wrapper over a native range input. The feature cards drive sliders
 * with native ranges (free OS thumb + keyboard handling), so this keeps that DOM
 * and just centralizes the shared `w-full` + disabled styling and the
 * `type="range"` the call sites used to repeat. Forwards every native input prop.
 */
function Slider({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn(
        'w-full disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Slider };
