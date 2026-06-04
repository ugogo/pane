import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// Expo Go-compatible slider using native gesture recognition. It maps the
// gesture's absolute X position against the track's measured window position.
export function Slider({
  value,
  onValueChange,
  onChange,
  disabled = false,
}: {
  value: number;
  onValueChange?: (value: number) => void;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<View>(null);
  const leftRef = useRef(0);
  const widthRef = useRef(0);
  const onValueChangeRef = useRef(onValueChange);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  onValueChangeRef.current = onValueChange;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  const measure = () => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      leftRef.current = x;
      widthRef.current = width;
    });
  };

  const emitFromPosition = (pageX: number, commit: boolean) => {
    const width = widthRef.current;
    if (width <= 0) return;
    const offset = pageX - leftRef.current;
    const ratio = Math.max(0, Math.min(1, offset / width));
    const next = Math.round(ratio * 100);
    onValueChangeRef.current?.(next);
    if (commit) onChangeRef.current(next);
  };

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success) {
        measure();
        emitFromPosition(event.absoluteX, true);
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .onBegin((event) => {
      measure();
      emitFromPosition(event.absoluteX, false);
    })
    .onUpdate((event) => emitFromPosition(event.absoluteX, false))
    .onFinalize((event) => emitFromPosition(event.absoluteX, true));

  const sliderGesture = Gesture.Race(tapGesture, panGesture);

  return (
    <GestureDetector gesture={sliderGesture}>
      <View ref={trackRef} hitSlop={16} style={styles.track} onLayout={measure}>
        <View
          pointerEvents="none"
          style={[styles.fill, { width: `${value}%` as `${number}%` }]}
        />
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: `${value}%` as `${number}%` }]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: '#2a2a2e',
    borderRadius: 999,
    height: 8,
    justifyContent: 'center',
    marginVertical: 12,
  },
  fill: {
    backgroundColor: '#5ed6a8',
    borderRadius: 999,
    height: 8,
  },
  thumb: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    height: 24,
    marginLeft: -12,
    position: 'absolute',
    width: 24,
  },
});
