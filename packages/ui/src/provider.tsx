import type { ReactNode } from 'react';
import { TamaguiProvider, type TamaguiProviderProps } from 'tamagui';

import tamaguiConfig from './tamagui.config';

export function UIProvider({
  children,
  ...props
}: Omit<TamaguiProviderProps, 'config' | 'defaultTheme'> & {
  children: ReactNode;
}) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark" {...props}>
      {children}
    </TamaguiProvider>
  );
}
