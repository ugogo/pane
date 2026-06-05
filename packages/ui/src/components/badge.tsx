import { Text, type TextProps, XStack } from 'tamagui';

import { colors, status } from '../tokens';

export type BadgeVariant = 'default' | 'pass' | 'fail' | 'disabled';

const toneStyles: Record<
  BadgeVariant,
  { backgroundColor: string; color: string }
> = {
  default: { backgroundColor: colors.secondary, color: colors.foreground },
  pass: { backgroundColor: status.passBg, color: status.pass },
  fail: { backgroundColor: status.failBg, color: status.fail },
  disabled: {
    backgroundColor: colors.secondary,
    color: colors.mutedForeground,
  },
};

export type BadgeProps = TextProps & {
  variant?: BadgeVariant;
};

export function Badge({ variant = 'default', children, ...props }: BadgeProps) {
  const tone = toneStyles[variant];
  return (
    <XStack
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius={1000}
      alignSelf="flex-start"
      style={{ backgroundColor: tone.backgroundColor }}
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
