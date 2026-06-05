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
  borderRadius: '$4',
});

export function SectionList({
  children,
  maxHeight = 160,
  ...props
}: ComponentProps<typeof SectionListFrame> & { maxHeight?: number }) {
  return (
    <SectionListFrame maxHeight={maxHeight} {...props}>
      <ScrollView maxHeight={maxHeight} showsVerticalScrollIndicator>
        {children}
      </ScrollView>
    </SectionListFrame>
  );
}

export const ListRow = styled(XStack, {
  borderColor: '$borderColor',
  gap: '$2',
  alignItems: 'center',
  paddingHorizontal: '$2.5',
  paddingVertical: '$2',

  variants: {
    active: {
      true: { backgroundColor: '$green4' },
      false: { backgroundColor: 'transparent' },
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
  justifyContent: 'flex-start',
  minHeight: 28,
  paddingHorizontal: 0,

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
  borderRadius: 1000,
  width: 6,

  variants: {
    active: {
      true: { backgroundColor: '$green9' },
      false: { backgroundColor: 'transparent' },
    },
  } as const,

  defaultVariants: {
    active: false,
  },
});

export const IconButton = styled(Button, {
  backgroundColor: '$gray3',
  borderColor: '$borderColor',
  borderWidth: 1,
  chromeless: true,
  height: 28,
  minWidth: 28,
  paddingHorizontal: 0,
  borderRadius: '$3',
  width: 28,
  pressStyle: { backgroundColor: '$gray4' },

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
  backgroundColor: '$gray2',
  borderColor: '$borderColor',
  borderWidth: 1,
  flex: 1,
  minWidth: 140,
  padding: '$3',
  borderRadius: '$4',
});

export const MutedPanel = styled(YStack, {
  backgroundColor: '$gray3',
  borderColor: '$borderColor',
  borderWidth: 1,
  gap: '$3',
  padding: '$3',
  borderRadius: '$4',
});

export const DeviceIcon = styled(XStack, {
  backgroundColor: '$gray3',
  borderColor: '$borderColor',
  borderWidth: 1,
  height: 32,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '$3',
  width: 32,
});

export const SliderRow = styled(XStack, {
  gap: '$2.5',
  alignItems: 'center',
  marginTop: '$2',
});

export const SliderLabel = styled(XStack, {
  gap: '$1',
  alignItems: 'center',
  flexShrink: 0,
  width: 92,
});

export const SliderValue = styled(Text, {
  color: '$placeholderColor',
  fontSize: '$2',
  flexShrink: 0,
  textAlign: 'right',
  width: 44,
});

export const PresetGroup = styled(XStack, {
  borderColor: '$borderColor',
  borderWidth: 1,
  overflow: 'hidden',
  borderRadius: '$4',
});

export const PresetNameButton = styled(Button, {
  backgroundColor: '$gray3',
  chromeless: true,
  color: '$color',
  fontSize: '$2',
  fontWeight: '600',
  height: TOOLBAR_HEIGHT,
  minHeight: TOOLBAR_HEIGHT,
  pressStyle: { backgroundColor: '$gray4' },
  paddingHorizontal: '$2.5',
  paddingVertical: 0,
  borderRadius: 0,
});

export const PresetIconButton = styled(Button, {
  backgroundColor: '$gray3',
  borderColor: '$borderColor',
  borderLeftWidth: 1,
  chromeless: true,
  color: '$placeholderColor',
  height: TOOLBAR_HEIGHT,
  minHeight: TOOLBAR_HEIGHT,
  minWidth: TOOLBAR_HEIGHT,
  pressStyle: { backgroundColor: '$gray4' },
  paddingHorizontal: 0,
  borderRadius: 0,
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
        marginTop="$1"
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
      <XStack flex={1} gap="$2" alignItems="center" minWidth={0}>
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
