import type { ReactNode } from 'react';
import { type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, YStack } from '@pane/ui';

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
  if (safeArea) {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: '#2e2e32' }, style]}>
        <StatusBar style="light" />
        <YStack
          flex={1}
          items={center ? 'center' : undefined}
          justify={center ? 'center' : undefined}
        >
          {children}
        </YStack>
      </SafeAreaView>
    );
  }

  return (
    <View flex={1} background="$background" style={style}>
      <StatusBar style="light" />
      <YStack
        flex={1}
        items={center ? 'center' : undefined}
        justify={center ? 'center' : undefined}
      >
        {children}
      </YStack>
    </View>
  );
}
