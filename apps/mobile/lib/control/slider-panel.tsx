import { Button, Card, Label, MutedText, Slider, XStack } from '@pane/ui';

/**
 * Labeled value + native slider (+ optional secondary action) for brightness,
 * volume, and light controls.
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
  sliderDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <Card offline={offline}>
      <XStack alignItems="center" justifyContent="space-between">
        <Label>{label}</Label>
        <MutedText>{valueText}</MutedText>
      </XStack>
      <Slider
        disabled={sliderDisabled ?? offline}
        value={value}
        onChange={onChange}
        onValueChange={onValueChange}
      />
      {secondaryLabel && onSecondary ? (
        <Button
          disabled={offline}
          btnScale="sm"
          appearance="secondary"
          onPress={onSecondary}
        >
          {secondaryLabel}
        </Button>
      ) : null}
    </Card>
  );
}
