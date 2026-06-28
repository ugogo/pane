/**
 * Button variants (Pickle UI):
 * - primary — one main action per card/section (Capture, Save)
 * - outline — secondary actions: Refresh, Apply, Copy/Save on overlays
 * - ghost — list rows, low-emphasis (device select, + Save preset)
 * - secondary — toggle/pressed states (aria-pressed), preset name pills
 *
 * Page status: place PageStatus directly under any page toolbar and before
 * content cards so feedback reads consistently across shell routes.
 */
import type { ReactNode } from 'react';
import { StatusText } from '@/components/features/status-ui';
import type { Status } from '@/lib/status';

export function PageStatus({
  status,
  children,
}: {
  status: Status;
  children?: ReactNode;
}) {
  if (!children) return null;
  return <StatusText status={status}>{children}</StatusText>;
}
