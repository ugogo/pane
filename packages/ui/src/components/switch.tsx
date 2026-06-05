import { Platform } from 'react-native';
import { Switch, type SwitchProps } from 'tamagui';

export type SwitchFieldProps = Omit<
  SwitchProps,
  'checked' | 'onCheckedChange' | 'native' | 'defaultChecked' | 'value'
> & {
  /** React Native-style */
  value?: boolean;
  onValueChange?: (enabled: boolean) => void;
  /** Web / shadcn-style aliases */
  checked?: boolean;
  onCheckedChange?: (enabled: boolean) => void;
};

export function SwitchField({
  value,
  checked,
  onValueChange,
  onCheckedChange,
  disabled,
  ...props
}: SwitchFieldProps) {
  const isChecked = checked ?? value ?? false;
  const onChange = onCheckedChange ?? onValueChange;
  const useNative = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <Switch
      backgroundColor={isChecked ? '$green4' : '$gray3'}
      borderColor={isChecked ? '$green9' : '$borderColor'}
      borderWidth={1}
      checked={isChecked}
      disabled={disabled}
      style={
        Platform.OS === 'web'
          ? {
              transition:
                'background-color 160ms ease, border-color 160ms ease',
            }
          : undefined
      }
      {...(useNative ? { native: 'mobile' as const } : {})}
      onCheckedChange={(next) => onChange?.(next)}
      {...props}
    >
      <Switch.Thumb
        backgroundColor="$gray12"
        style={
          Platform.OS === 'web'
            ? {
                transition: 'transform 160ms ease, background-color 160ms ease',
              }
            : undefined
        }
      />
    </Switch>
  );
}
