import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('grid min-h-[280px] place-items-center', className)}>
      <output aria-label="Loading" className="grid place-items-center">
        <Loader2
          aria-hidden="true"
          className="text-muted-foreground size-5 animate-spin"
        />
      </output>
    </div>
  );
}
