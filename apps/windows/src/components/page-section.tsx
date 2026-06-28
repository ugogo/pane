import type { ReactNode } from 'react';
import { Text, YStack } from 'pickle-ui';

export function PageSection({
  title,
  description,
  children,
  divider = false,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <YStack gap={3}>
      {title || description ? (
        <YStack gap={1}>
          {title ? (
            <Text as="h2" weight="bold">
              {title}
            </Text>
          ) : null}
          {description ? <Text tone="muted">{description}</Text> : null}
        </YStack>
      ) : null}
      {children}
      {divider ? <hr className="border-[var(--app-border-medium)]" /> : null}
    </YStack>
  );
}
