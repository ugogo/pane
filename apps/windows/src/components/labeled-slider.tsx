import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Slider, Text } from 'pickle-ui';

export function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onValueChange,
  formatValue = (n) => `${n}%`,
  leading,
  leadingIcon: LeadingIcon,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  formatValue?: (value: number) => string;
  leading?: ReactNode;
  leadingIcon?: LucideIcon;
  className?: string;
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
      className={className}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {LeadingIcon ? <LeadingIcon aria-hidden size={12} /> : leading}
          <Slider.Label>{label}</Slider.Label>
        </div>
        <Slider.Value>
          {(_, values) => (
            <Text as="span" variant="small" tone="muted">
              {formatValue(values[0] ?? value)}
            </Text>
          )}
        </Slider.Value>
      </div>
    </Slider>
  );
}
