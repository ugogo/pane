import QRCodeSvg from 'react-native-qrcode-svg';
import { styled, YStack, type YStackProps } from 'tamagui';

import { colors } from '../tokens';

export type QRCodeProps = Omit<YStackProps, 'backgroundColor'> & {
  value: string;
  size?: number;
  /** Error correction: L, M, Q, H */
  level?: 'L' | 'M' | 'Q' | 'H';
  backgroundColor?: string;
  color?: string;
  containerBackgroundColor?: YStackProps['backgroundColor'];
  quietZone?: number;
};

const QRCodeFrame = styled(YStack, {
  alignItems: 'center',
  padding: '$3',
  borderRadius: '$3',
});

export function QRCode({
  value,
  size = 176,
  level = 'M',
  backgroundColor = colors.white,
  color = colors.black,
  containerBackgroundColor = '$white',
  quietZone = 0,
  ...containerProps
}: QRCodeProps) {
  return (
    <QRCodeFrame backgroundColor={containerBackgroundColor} {...containerProps}>
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
