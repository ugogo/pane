import { Text } from 'pickle-ui';

export function EditorSectionHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Text as="h2" variant="small" weight="bold" tone="muted">
      {children}
    </Text>
  );
}
