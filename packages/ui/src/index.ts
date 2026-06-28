export { default as tamaguiConfig } from './tamagui.config';
export type { UITamaguiConfig } from './tamagui.config';
export { colors, radius, status } from './tokens';
export { UIProvider } from './provider';

export {
  SwitchField as Switch,
  type SwitchFieldProps as SwitchProps,
} from './components/switch';
export { SliderField as Slider, type SliderProps } from './components/slider';
export {
  Button,
  TOOLBAR_HEIGHT,
  type ButtonProps,
  type ButtonScale as ButtonSize,
  type ButtonVariant,
} from './components/button';
export {
  CardFrame as Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type CardProps,
} from './components/card';
export { Badge, type BadgeProps, type BadgeVariant } from './components/badge';
export { Label, MutedText, Text, type TextProps } from './components/text';
export {
  PageTransition,
  PopupTransition,
  type PageTransitionProps,
  type PopupTransitionProps,
} from './components/motion';
export {
  DeviceIcon,
  IconButton,
  ListDot,
  ListRow,
  ListRowButton,
  ListRowContent,
  MutedPanel,
  PresetGroup,
  PresetIconButton,
  PresetNameButton,
  SectionList,
  SliderLabel,
  SliderRow,
  SliderValue,
  Stat,
  StatFrame,
} from './components/layout';

export {
  Separator,
  Spinner,
  Theme,
  View,
  XStack,
  YStack,
  ScrollView,
  Tooltip,
  TooltipGroup,
  Sheet,
  Input,
  TextArea,
  AnimatePresence,
} from 'tamagui';
