import { Button as TamaguiButton, styled, type GetProps } from 'tamagui';

/** Shared height for toolbar / preset / sm action buttons. */
export const TOOLBAR_HEIGHT = 34;

export const Button = styled(TamaguiButton, {
  fontSize: '$2',
  fontWeight: '600',
  paddingHorizontal: '$3',

  variants: {
    appearance: {
      default: { backgroundColor: '$gray3', color: '$color', borderWidth: 0 },
      outline: {
        backgroundColor: 'transparent',
        borderColor: '$borderColor',
        borderWidth: 1,
        color: '$color',
        variant: 'outlined',
      },
      secondary: { backgroundColor: '$gray3', color: '$color', borderWidth: 0 },
      ghost: {
        backgroundColor: 'transparent',
        color: '$color',
        borderWidth: 0,
        chromeless: true,
      },
      destructive: {
        backgroundColor: '$red1',
        color: '$red11',
        borderWidth: 0,
      },
    },
    btnScale: {
      default: {
        height: TOOLBAR_HEIGHT,
        minHeight: TOOLBAR_HEIGHT,
      },
      sm: {
        height: TOOLBAR_HEIGHT,
        minHeight: TOOLBAR_HEIGHT,
      },
      xs: {
        height: TOOLBAR_HEIGHT,
        minHeight: TOOLBAR_HEIGHT,
      },
      lg: {
        height: 38,
        minHeight: 38,
      },
      icon: {
        width: TOOLBAR_HEIGHT,
        height: TOOLBAR_HEIGHT,
        paddingHorizontal: 0,
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
