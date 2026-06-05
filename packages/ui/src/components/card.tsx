import type { ComponentProps, ReactNode } from 'react';
import { Card, styled, Text, YStack } from 'tamagui';

export const CardFrame = styled(Card, {
  bg: '$gray2',
  borderColor: '$borderColor',
  borderWidth: 1,
  gap: '$4',
  p: '$5',
  rounded: '$6',

  variants: {
    offline: {
      true: { opacity: 0.5 },
      false: { opacity: 1 },
    },
  } as const,

  defaultVariants: {
    offline: false,
  },
});

export type CardProps = ComponentProps<typeof CardFrame> & {
  children?: ReactNode;
};

export const CardHeader = styled(YStack, {
  gap: '$1',
});

export const CardTitle = styled(Text, {
  color: '$color',
  fontSize: '$5',
  fontWeight: '600',
});

export const CardDescription = styled(Text, {
  color: '$placeholderColor',
  fontSize: '$3',
});

export const CardContent = styled(YStack, {
  gap: '$3',
});
