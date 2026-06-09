import type { ReactNode } from 'react';
import { YStack, type YStackProps } from 'tamagui';

type PresenceMode = 'sync' | 'wait';

export type PageTransitionProps = Omit<YStackProps, 'children'> & {
  children: ReactNode;
  initial?: boolean;
  mode?: PresenceMode;
  motionKey: string | number;
};

// Plain remount-on-key swap. (Tamagui v1 has no v5-css named transitions; the
// enter/exit animation can be reintroduced with a v1 animation driver later.)
// `initial`/`mode` are accepted for API compatibility but currently unused.
export function PageTransition({
  children,
  initial,
  mode,
  motionKey,
  ...props
}: PageTransitionProps) {
  void initial;
  void mode;
  return (
    <YStack key={motionKey} {...props}>
      {children}
    </YStack>
  );
}

export type PopupTransitionProps = Omit<YStackProps, 'children'> & {
  children: ReactNode;
  initial?: boolean;
  mode?: PresenceMode;
  motionKey: string | number;
};

export function PopupTransition({
  children,
  initial,
  mode,
  motionKey,
  ...props
}: PopupTransitionProps) {
  void initial;
  void mode;
  return (
    <YStack key={motionKey} {...props}>
      {children}
    </YStack>
  );
}
