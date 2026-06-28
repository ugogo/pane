import { Slider, Text } from 'pickle-ui';

export function EditorSliderField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onValueChange,
  unit = 'px',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <Slider
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={[value]}
      disabled={disabled}
      onValueChange={(next) =>
        onValueChange(typeof next === 'number' ? next : (next[0] ?? value))
      }
      className="mb-1.5"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <Slider.Label>{label}</Slider.Label>
        <Slider.Value>
          {(_, values) => (
            <Text as="span" variant="small" tone="muted">
              {values[0]}
              {unit}
            </Text>
          )}
        </Slider.Value>
      </div>
    </Slider>
  );
}
