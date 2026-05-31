import type { BadgeProps } from '@fluentui/react-components';

/**
 * The probe status shared by every feature card. Previously each card declared
 * its own union + Tailwind style map; now it maps onto a Fluent Badge color.
 */
export type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail' | 'disabled';

export function statusBadgeColor(status: ProbeStatus): BadgeProps['color'] {
  switch (status) {
    case 'pass':
      return 'success';
    case 'warn':
      return 'warning';
    case 'fail':
      return 'danger';
    case 'disabled':
      return 'subtle';
    case 'idle':
    default:
      return 'informative';
  }
}
