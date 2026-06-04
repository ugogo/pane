import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Status } from '@/lib/status';

export function StatusBadge({
  status,
  children,
}: {
  status: Status;
  children?: ReactNode;
}) {
  if (status === 'idle') return null;

  const variant =
    status === 'fail'
      ? 'destructive'
      : status === 'pass'
        ? 'default'
        : 'secondary';

  return <Badge variant={variant}>{children ?? labelFromStatus(status)}</Badge>;
}

export function StatusText({
  status,
  children,
  className,
}: {
  status: Status;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-muted-foreground text-sm',
        status === 'fail' && 'text-destructive',
        className,
      )}
    >
      {children}
    </p>
  );
}

function labelFromStatus(status: Status) {
  switch (status) {
    case 'pass':
      return 'OK';
    case 'warn':
      return 'Check';
    case 'fail':
      return 'Error';
    case 'disabled':
      return 'Off';
    case 'idle':
      return null;
  }
}
