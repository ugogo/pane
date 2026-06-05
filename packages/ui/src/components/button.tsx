import { Button as TamaguiButton, styled, type GetProps } from 'tamagui';

/** Shared height for toolbar / preset / sm action buttons. */
export const TOOLBAR_HEIGHT = 32;

export const Button = styled(TamaguiButton, {
  fontWeight: '600',

  variants: {
    appearance: {
      default: { bg: '$gray3', color: '$color', borderWidth: 0 },
      outline: {
        bg: 'transparent',
        borderColor: '$borderColor',
        borderWidth: 1,
        color: '$color',
        variant: 'outlined',
      },
      secondary: { bg: '$gray3', color: '$color', borderWidth: 0 },
      ghost: {
        bg: 'transparent',
        color: '$color',
        borderWidth: 0,
        chromeless: true,
      },
      destructive: { bg: '$red1', color: '$red11', borderWidth: 0 },
    },
    btnScale: {
      default: {
        size: '$3',
        height: TOOLBAR_HEIGHT,
        minH: TOOLBAR_HEIGHT,
      },
      sm: {
        size: '$2',
        height: TOOLBAR_HEIGHT,
        minH: TOOLBAR_HEIGHT,
      },
      xs: {
        size: '$2',
        height: TOOLBAR_HEIGHT,
        minH: TOOLBAR_HEIGHT,
      },
      lg: { size: '$4' },
      icon: {
        size: '$2',
        width: TOOLBAR_HEIGHT,
        height: TOOLBAR_HEIGHT,
        px: 0,
      },
    },
  } as const,

  defaultVariants: {
    appearance: 'default',
    btnScale: 'default',
  },
});

export type ButtonProps = GetProps<typeof Button>;
export type ButtonVariant = NonNullable<ButtonProps['appearance']>;
export type ButtonScale = NonNullable<ButtonProps['btnScale']>;
