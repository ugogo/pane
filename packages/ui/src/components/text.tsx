import {
  Paragraph,
  SizableText,
  styled,
  type TextProps as TamaguiTextProps,
} from 'tamagui';

export type TextProps = TamaguiTextProps;

export const Text = styled(Paragraph, {
  color: '$color',
});

export const Label = styled(SizableText, {
  color: '$color',
  fontSize: '$4',
  fontWeight: '600',
});

export const MutedText = styled(SizableText, {
  color: '$placeholderColor',
  fontSize: '$3',
});
