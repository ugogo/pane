import { Pressable, Text, View } from 'react-native';
import { Slider } from '../../components/Slider';
import { controlStyles as styles } from './control.styles';

/**
 * The shared "labeled value + slider (+ optional action button)" panel used by
 * the brightness, volume, and light controls. Collapses three near-identical
 * blocks that previously lived inline in the control screen.
 */
export function SliderPanel({
  label,
  valueText,
  value,
  offline,
  onValueChange,
  onChange,
  sliderDisabled,
  secondaryLabel,
  onSecondary,
}: {
  label: string;
  valueText: string;
  value: number;
  offline: boolean;
  onValueChange?: (value: number) => void;
  onChange: (value: number) => void;
  /** Defaults to `offline`; pass e.g. `offline || muted` to disable separately. */
  sliderDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={[styles.panel, offline && styles.panelOffline]}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{valueText}</Text>
      </View>
      <Slider
        value={value}
        onValueChange={onValueChange}
        onChange={onChange}
        disabled={sliderDisabled ?? offline}
      />
      {secondaryLabel && onSecondary ? (
        <Pressable
          disabled={offline}
          style={styles.secondaryButton}
          onPress={onSecondary}
        >
          <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
