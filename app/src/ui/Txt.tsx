/**
 * `<Txt variant="display" color="ember">` — every piece of text in the app. Variant supplies the
 * family/size/line-height (and uppercase for display/h1/h2/eyebrow/button); color is a token name.
 */
import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { numeralMaxFontScale, type, useTheme, type TypeVariant, type ColorName } from '../theme';

export interface TxtProps extends TextProps {
  variant?: TypeVariant;
  /** Token name from `colors`. Defaults to `text`. */
  color?: ColorName;
  /** Force uppercase on/off; by default the variant decides. */
  upper?: boolean;
  align?: TextStyle['textAlign'];
}

export function Txt({
  variant = 'body',
  color = 'text',
  upper,
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TxtProps): React.JSX.Element {
  const theme = useTheme();
  const isNumeral = variant === 'mega' || variant === 'hero';
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (isNumeral ? numeralMaxFontScale : undefined)}
      {...rest}
      style={[
        type[variant],
        { color: theme.colors[color] },
        upper !== undefined && { textTransform: upper ? 'uppercase' : 'none' },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
