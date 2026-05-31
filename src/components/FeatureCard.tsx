import type { ReactNode } from 'react';
import {
  Card,
  CardHeader,
  Badge,
  Subtitle2,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { statusBadgeColor, type ProbeStatus } from '../lib/status';

const useStyles = makeStyles({
  card: {
    rowGap: '12px',
  },
  wide: {
    gridColumn: '1 / -1',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    color: tokens.colorBrandForeground1,
    fontSize: '20px',
  },
  action: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

export interface FeatureCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional brand-colored icon in the header's image slot. */
  icon?: ReactNode;
  /** Renders a status pill in the header's action slot. */
  status?: ProbeStatus;
  /** Extra header-action content rendered left of the status pill. */
  actions?: ReactNode;
  /** Span both columns of the App grid. */
  wide?: boolean;
  children?: ReactNode;
}

/**
 * The Fluent shell for every feature panel: a Card with a header (icon, title,
 * description, status badge + actions) and a body. Stateless — the parent owns
 * all data and state.
 */
export function FeatureCard({
  title,
  description,
  icon,
  status,
  actions,
  wide,
  children,
}: FeatureCardProps) {
  const styles = useStyles();
  const action =
    actions || status ? (
      <div className={styles.action}>
        {actions}
        {status ? (
          <Badge appearance="filled" color={statusBadgeColor(status)}>
            {status}
          </Badge>
        ) : null}
      </div>
    ) : undefined;

  return (
    <Card className={mergeClasses(styles.card, wide && styles.wide)}>
      <CardHeader
        image={icon ? <span className={styles.icon}>{icon}</span> : undefined}
        header={<Subtitle2>{title}</Subtitle2>}
        description={
          description ? <Caption1>{description}</Caption1> : undefined
        }
        action={action}
      />
      {children}
    </Card>
  );
}
