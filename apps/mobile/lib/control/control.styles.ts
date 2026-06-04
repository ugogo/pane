import { StyleSheet } from 'react-native';

export const controlStyles = StyleSheet.create({
  shell: {
    backgroundColor: '#0b0b0c',
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#fafafa',
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    color: '#fafafa',
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    color: '#a3a3a3',
    fontSize: 16,
  },
  panel: {
    backgroundColor: '#161618',
    borderColor: '#262629',
    borderRadius: 16,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  panelOffline: {
    opacity: 0.5,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    backgroundColor: '#2a2a2e',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#2a2a2e',
    borderRadius: 10,
    marginTop: 8,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    color: '#a3a3a3',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: '#f87171',
    fontSize: 14,
  },
});
