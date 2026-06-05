import { Text, type TextProps, XStack } from 'tamagui';

import { colors, status } from '../tokens';

export type BadgeVariant = 'default' | 'pass' | 'fail' | 'disabled';

const toneStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  default: { bg: colors.secondary, color: colors.foreground },
  pass: { bg: status.passBg, color: status.pass },
  fail: { bg: status.failBg, color: status.fail },
  disabled: { bg: colors.secondary, color: colors.mutedForeground },
};

export type BadgeProps = TextProps & {
  variant?: BadgeVariant;
};

export function Badge({ variant = 'default', children, ...props }: BadgeProps) {
  const tone = toneStyles[variant];
  return (
    <XStack
      px="$2"
      py="$1"
      rounded={1000}
      self="flex-start"
      style={{ backgroundColor: tone.bg }}
    >
      <Text
        fontSize="$2"
        fontWeight="600"
        style={{ color: tone.color }}
        {...props}
      >
        {children}
      </Text>
    </XStack>
  );
}
