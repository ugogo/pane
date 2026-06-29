import { LabeledSlider } from '@/components/labeled-slider';

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
    <LabeledSlider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={onValueChange}
      formatValue={(n) => `${n}${unit}`}
      className="mb-1.5"
    />
  );
}
