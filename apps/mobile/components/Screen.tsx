import type { ReactNode } from 'react';
import { type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usePathname } from 'expo-router';
import { colors, PageTransition, View } from '@pane/ui';

/**
 * Dark app shell shared by every screen. `center` vertically/horizontally centers
 * children; `safeArea={false}` opts out for screens that manage their own insets.
 */
export function Screen({
  children,
  center = false,
  safeArea = true,
  style,
}: {
  children: ReactNode;
  center?: boolean;
  safeArea?: boolean;
  style?: ViewStyle;
}) {
  const pathname = usePathname();
  const content = (
    <PageTransition
      motionKey={pathname}
      flex={1}
      alignItems={center ? 'center' : undefined}
      justifyContent={center ? 'center' : undefined}
    >
      {children}
    </PageTransition>
  );

  if (safeArea) {
    return (
      <SafeAreaView
        style={[{ flex: 1, backgroundColor: colors.background }, style]}
      >
        <StatusBar style="light" />
        {content}
      </SafeAreaView>
    );
  }

  return (
    <View flex={1} backgroundColor="$background" style={style}>
      <StatusBar style="light" />
      {content}
    </View>
  );
}
