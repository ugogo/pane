import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const actions = [
  'Scan pairing code',
  'Lighting scenes',
  'Brightness presets',
  'Audio output',
];

export default function App() {
  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Pane Companion</Text>
          <Text style={styles.title}>Local controls for Pane</Text>
          <Text style={styles.copy}>
            Pair with the desktop app, then control trusted settings from your
            iPhone.
          </Text>
        </View>

        <View style={styles.panel}>
          {actions.map((action) => (
            <TouchableOpacity key={action} style={styles.row}>
              <Text style={styles.rowText}>{action}</Text>
              <Text style={styles.rowMeta}>v1</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#f5f5f4',
  },
  content: {
    gap: 24,
    padding: 24,
  },
  header: {
    gap: 8,
    paddingTop: 16,
  },
  eyebrow: {
    color: '#0d7a5f',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0,
  },
  copy: {
    color: '#525252',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  rowMeta: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '600',
  },
  rowText: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '600',
  },
});
