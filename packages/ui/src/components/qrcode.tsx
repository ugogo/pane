import QRCodeSvg from 'react-native-qrcode-svg';
import { styled, YStack, type YStackProps } from 'tamagui';

import { colors } from '../tokens';

export type QRCodeProps = {
  value: string;
  size?: number;
  /** Error correction: L, M, Q, H */
  level?: 'L' | 'M' | 'Q' | 'H';
  backgroundColor?: string;
  color?: string;
  quietZone?: number;
} & YStackProps;

const QRCodeFrame = styled(YStack, {
  items: 'center',
  p: '$3',
  rounded: '$3',
});

export function QRCode({
  value,
  size = 176,
  level = 'M',
  backgroundColor = colors.white,
  color = colors.black,
  quietZone = 0,
  bg = '$white' as const,
  ...containerProps
}: QRCodeProps) {
  return (
    <QRCodeFrame bg={bg} {...containerProps}>
      <QRCodeSvg
        backgroundColor={backgroundColor}
        color={color}
        ecl={level}
        quietZone={quietZone}
        size={size}
        value={value}
      />
    </QRCodeFrame>
  );
}
