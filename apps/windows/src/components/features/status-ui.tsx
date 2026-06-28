import type { ReactNode } from 'react';
import { Badge, Text, type BadgeProps } from 'pickle-ui';
import type { Status } from '@/lib/status';

function badgeVariant(status: Status): BadgeProps['variant'] {
  if (status === 'fail') return 'failed';
  if (status === 'pass') return 'success';
  if (status === 'disabled') return 'secondary';
  return 'outline';
}

export function StatusBadge({
  status,
  children,
}: {
  status: Status;
  children?: ReactNode;
}) {
  if (status === 'idle') return null;
  return (
    <Badge variant={badgeVariant(status)}>
      {children ?? labelFromStatus(status)}
    </Badge>
  );
}

export function StatusText({
  status,
  children,
}: {
  status: Status;
  children: ReactNode;
}) {
  return (
    <Text
      className={
        status === 'fail'
          ? 'text-destructive'
          : status === 'pass'
            ? 'text-emerald-400'
            : status === 'warn'
              ? 'text-amber-400'
              : undefined
      }
      role={status === 'fail' ? 'alert' : 'status'}
    >
      {children}
    </Text>
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
