import type { ComponentProps, ReactNode } from 'react';
import {
  Button,
  ScrollView,
  SizableText,
  styled,
  Text,
  XStack,
  YStack,
} from 'tamagui';

import { TOOLBAR_HEIGHT } from './button';

const listMutedColor = '$placeholderColor';

export const SectionListFrame = styled(YStack, {
  borderColor: '$borderColor',
  borderWidth: 1,
  overflow: 'hidden',
  rounded: '$4',
});

export function SectionList({
  children,
  maxHeight = 160,
  ...props
}: ComponentProps<typeof SectionListFrame> & { maxHeight?: number }) {
  return (
    <SectionListFrame maxH={maxHeight} {...props}>
      <ScrollView flex={1} maxH={maxHeight} showsVerticalScrollIndicator>
        {children}
      </ScrollView>
    </SectionListFrame>
  );
}

export const ListRow = styled(XStack, {
  borderColor: '$borderColor',
  gap: '$2',
  items: 'center',
  px: '$2.5',
  py: '$2',

  variants: {
    active: {
      true: { bg: '$green4' },
      false: { bg: 'transparent' },
    },
    first: {
      true: { borderTopWidth: 0 },
      false: { borderTopWidth: 1 },
    },
  } as const,

  defaultVariants: {
    active: false,
    first: false,
  },
});

export const ListRowButton = styled(Button, {
  chromeless: true,
  flex: 1,
  fontSize: '$3',
  height: 'auto',
  justify: 'flex-start',
  minH: 28,
  px: 0,

  variants: {
    active: {
      true: { color: '$color', fontWeight: '600' },
      false: { color: listMutedColor, fontWeight: '400' },
    },
  } as const,

  defaultVariants: {
    active: false,
  },
});

export const ListDot = styled(YStack, {
  height: 6,
  rounded: 1000,
  width: 6,

  variants: {
    active: {
      true: { bg: '$green9' },
      false: { bg: 'transparent' },
    },
  } as const,

  defaultVariants: {
    active: false,
  },
});

export const IconButton = styled(Button, {
  bg: '$gray3',
  borderColor: '$borderColor',
  borderWidth: 1,
  chromeless: true,
  height: 28,
  minW: 28,
  px: 0,
  rounded: '$3',
  width: 28,
  pressStyle: { bg: '$gray4' },

  variants: {
    active: {
      true: { color: '$color' },
      false: { color: listMutedColor },
    },
  } as const,

  defaultVariants: {
    active: false,
  },
});

export const StatFrame = styled(YStack, {
  bg: '$gray2',
  borderColor: '$borderColor',
  borderWidth: 1,
  flex: 1,
  minW: 140,
  p: '$3',
  rounded: '$4',
});

export const MutedPanel = styled(YStack, {
  bg: '$gray3',
  borderColor: '$borderColor',
  borderWidth: 1,
  gap: '$3',
  p: '$3',
  rounded: '$4',
});

export const DeviceIcon = styled(XStack, {
  bg: '$gray3',
  borderColor: '$borderColor',
  borderWidth: 1,
  height: 32,
  items: 'center',
  justify: 'center',
  rounded: '$3',
  width: 32,
});

export const SliderRow = styled(XStack, {
  gap: '$2.5',
  items: 'center',
  mt: '$2',
});

export const SliderLabel = styled(XStack, {
  gap: '$1',
  items: 'center',
  shrink: 0,
  width: 92,
});

export const SliderValue = styled(Text, {
  color: '$placeholderColor',
  fontSize: '$2',
  shrink: 0,
  text: 'right',
  width: 44,
});

export const PresetGroup = styled(XStack, {
  borderColor: '$borderColor',
  borderWidth: 1,
  overflow: 'hidden',
  rounded: '$4',
});

export const PresetNameButton = styled(Button, {
  bg: '$gray3',
  chromeless: true,
  color: '$color',
  fontSize: '$2',
  fontWeight: '600',
  height: TOOLBAR_HEIGHT,
  minH: TOOLBAR_HEIGHT,
  pressStyle: { bg: '$gray4' },
  px: '$2.5',
  py: 0,
  rounded: 0,
});

export const PresetIconButton = styled(Button, {
  bg: '$gray3',
  borderColor: '$borderColor',
  borderLeftWidth: 1,
  chromeless: true,
  color: '$placeholderColor',
  height: TOOLBAR_HEIGHT,
  minH: TOOLBAR_HEIGHT,
  minW: TOOLBAR_HEIGHT,
  pressStyle: { bg: '$gray4' },
  px: 0,
  rounded: 0,
  width: TOOLBAR_HEIGHT,
});

export function Stat({
  label,
  value,
  ...props
}: ComponentProps<typeof StatFrame> & {
  label: string;
  value: string;
}) {
  return (
    <StatFrame {...props}>
      <Text color="$placeholderColor" fontSize="$2">
        {label}
      </Text>
      <Text
        color="$color"
        fontSize="$3"
        fontWeight="600"
        mt="$1"
        style={{ fontFamily: 'monospace' }}
      >
        {value}
      </Text>
    </StatFrame>
  );
}

export function ListRowContent({
  active,
  label,
  onPress,
  disabled,
}: {
  active?: boolean;
  label: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <ListRowButton active={active} disabled={disabled} onPress={onPress}>
      <XStack flex={1} gap="$2" items="center" minW={0}>
        <ListDot active={active} />
        <SizableText
          color={active ? '$color' : listMutedColor}
          flex={1}
          fontSize="$3"
          fontWeight={active ? '600' : '400'}
          numberOfLines={1}
        >
          {label}
        </SizableText>
      </XStack>
    </ListRowButton>
  );
}
