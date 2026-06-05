import type { ReactNode } from 'react';
import {
  Badge,
  MutedText,
  colors,
  status as uiStatus,
  type BadgeVariant,
} from '@pane/ui';
import type { Status } from '@/lib/status';

function statusMessageColor(status: Status): string | undefined {
  if (status === 'fail') return colors.destructive;
  if (status === 'pass') return uiStatus.pass;
  if (status === 'warn') return uiStatus.warn;
  return undefined;
}

function badgeVariant(status: Status): BadgeVariant {
  if (status === 'fail') return 'fail';
  if (status === 'pass') return 'pass';
  if (status === 'disabled') return 'disabled';
  return 'default';
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
  const color = statusMessageColor(status);
  return (
    <MutedText fontSize="$3" style={color ? { color } : undefined}>
      {children}
    </MutedText>
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
