import type { ReactNode } from 'react';
import { AnimatePresence, YStack, type YStackProps } from 'tamagui';

type PresenceMode = 'sync' | 'wait';

export type PageTransitionProps = Omit<YStackProps, 'children'> & {
  children: ReactNode;
  initial?: boolean;
  mode?: PresenceMode;
  motionKey: string | number;
};

export function PageTransition({
  children,
  initial = true,
  mode = 'wait',
  motionKey,
  ...props
}: PageTransitionProps) {
  return (
    <AnimatePresence initial={initial} mode={mode}>
      <YStack
        key={motionKey}
        transition="quickLessBouncy"
        enterStyle={{ opacity: 0, y: 8 }}
        exitStyle={{ opacity: 0, y: -4 }}
        opacity={1}
        y={0}
        {...props}
      >
        {children}
      </YStack>
    </AnimatePresence>
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
  initial = true,
  mode = 'sync',
  motionKey,
  ...props
}: PopupTransitionProps) {
  return (
    <AnimatePresence initial={initial} mode={mode}>
      <YStack
        key={motionKey}
        transition="quickerLessBouncy"
        enterStyle={{ opacity: 0, scale: 0.98, y: 4 }}
        exitStyle={{ opacity: 0, scale: 0.98, y: 2 }}
        opacity={1}
        scale={1}
        y={0}
        {...props}
      >
        {children}
      </YStack>
    </AnimatePresence>
  );
}
