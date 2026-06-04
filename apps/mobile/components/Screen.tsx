import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';

/**
 * The dark app shell shared by every screen: full-bleed background + light
 * status bar. `center` vertically/horizontally centers children (loading and
 * permission states); `safeArea={false}` opts out of the safe-area inset for
 * screens that manage their own (the control screen scrolls with
 * `contentInsetAdjustmentBehavior`).
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
  const Container = safeArea ? SafeAreaView : View;
  return (
    <Container style={[styles.shell, center && styles.center, style]}>
      <StatusBar style="light" />
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.background,
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
