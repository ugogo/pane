import { useEffect, useState, type ComponentProps } from 'react';
import QRCode from 'qrcode';

export type WebQRCodeProps = Omit<ComponentProps<'div'>, 'children'> & {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  backgroundColor?: string;
  color?: string;
  containerBackgroundColor?: string;
  quietZone?: number;
};

export function WebQRCode({
  value,
  size = 176,
  level = 'M',
  backgroundColor = '#ffffff',
  color = '#000000',
  containerBackgroundColor = '#ffffff',
  quietZone = 0,
  className,
  style,
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
    <div
      className={className}
      style={{
        alignItems: 'center',
        backgroundColor: containerBackgroundColor,
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'center',
        padding: 12,
        ...style,
      }}
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
        <div style={{ height: size, width: size }} />
      )}
    </div>
  );
}
