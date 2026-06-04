import { StyleSheet } from 'react-native';
import { colors } from '../theme';

export const controlStyles = StyleSheet.create({
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
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    color: colors.textMuted,
    fontSize: 16,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
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
    backgroundColor: colors.elevated,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.elevated,
    borderRadius: 10,
    marginTop: 8,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
