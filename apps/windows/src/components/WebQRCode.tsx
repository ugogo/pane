import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { type YStackProps } from 'tamagui';
import { colors, YStack } from '@pane/ui';

export type WebQRCodeProps = Omit<YStackProps, 'backgroundColor'> & {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  backgroundColor?: string;
  color?: string;
  containerBackgroundColor?: YStackProps['backgroundColor'];
  quietZone?: number;
};

export function WebQRCode({
  value,
  size = 176,
  level = 'M',
  backgroundColor = colors.white,
  color = colors.black,
  containerBackgroundColor = '$white',
  quietZone = 0,
  ...containerProps
}: WebQRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      color: {
        dark: color,
        light: backgroundColor,
      },
      errorCorrectionLevel: level,
      margin: quietZone,
      width: size,
    })
      .then((nextDataUrl) => {
        if (!cancelled) setDataUrl(nextDataUrl);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [backgroundColor, color, level, quietZone, size, value]);

  return (
    <YStack
      alignItems="center"
      backgroundColor={containerBackgroundColor}
      borderRadius="$3"
      padding="$3"
      {...containerProps}
    >
      {dataUrl ? (
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          height={size}
          src={dataUrl}
          width={size}
        />
      ) : (
        <YStack height={size} width={size} />
      )}
    </YStack>
  );
}
