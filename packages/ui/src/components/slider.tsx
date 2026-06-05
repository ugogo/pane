import { useCallback } from 'react';
import { Platform } from 'react-native';
import RNCSlider from '@react-native-community/slider';
import { Slider, YStack } from 'tamagui';

import { colors } from '../tokens';

export type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
  /** Fires when the user releases the thumb (native) or on change (web). */
  onChange?: (value: number) => void;
};

export function SliderField({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  onValueChange,
  onChange,
}: SliderProps) {
  const clamped = Math.min(max, Math.max(min, value));

  const handleChange = useCallback(
    (next: number) => {
      onValueChange?.(next);
      onChange?.(next);
    },
    [onChange, onValueChange],
  );

  if (Platform.OS === 'web') {
    return (
      <YStack flex={1} minWidth={0}>
        <Slider
          disabled={disabled}
          max={max}
          min={min}
          step={step}
          value={[clamped]}
          onValueChange={(values) => handleChange(values[0] ?? clamped)}
        >
          <Slider.Track backgroundColor="$gray4" height={6} borderRadius={1000}>
            <Slider.TrackActive backgroundColor="$green9" />
          </Slider.Track>
          <Slider.Thumb
            backgroundColor="$color"
            borderWidth={0}
            index={0}
            size="$1"
          />
        </Slider>
      </YStack>
    );
  }

  return (
    <RNCSlider
      disabled={disabled}
      maximumTrackTintColor={colors.input}
      maximumValue={max}
      minimumTrackTintColor={colors.accent}
      minimumValue={min}
      step={step}
      thumbTintColor={colors.foreground}
      value={clamped}
      onSlidingComplete={(next) => onChange?.(next)}
      onValueChange={(next) => {
        onValueChange?.(next);
      }}
    />
  );
}
