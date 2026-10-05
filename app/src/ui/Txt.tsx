/**
 * `<Txt variant="display" color="teal">` — every piece of text in the app. Variant supplies the
 * family/size/line-height (and uppercase for display/h1/h2/eyebrow/button); color is a token name.
 *
 * `adjustsFontSizeToFit` is implemented here in JS (`fitFontSize`), not passed to the native Text:
 * on iOS under the New Architecture the native shrink ignores `minimumFontScale` and can fall to
 * 4pt. `minimumFontScale` (default 0.5) is the floor; below it the text ellipsizes instead.
 *
 * The available width is learned from layout, since Text measures to at most its container:
 * - a layout narrower than the full-size text means it was clipped, so that width IS the room;
 * - a layout wider than the text means it is stretched to its container, so that width is the room
 *   too (and it will not change, or fire another layout, when the text grows);
 * - a layout that matches the text says nothing, so it stays at full size until one of the above.
 * Once the room is known the size is fitted to it, growing back for shorter text.
 */
import React, { Children, useState } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';
import {
  fitFontSize,
  fitsAt,
  lineWidth,
  numeralMaxFontScale,
  type,
  useTheme,
  type FitTextInput,
  type TypeVariant,
  type ColorName,
} from '../theme';

export interface TxtProps extends TextProps {
  variant?: TypeVariant;
  /** Token name from `colors`. Defaults to `text`. */
  color?: ColorName;
  /** Force uppercase on/off; by default the variant decides. */
  upper?: boolean;
  align?: TextStyle['textAlign'];
}

/** Default floor for fitted text, as a fraction of its style size. */
const DEFAULT_MIN_SCALE = 0.5;

/** The plain string a Txt renders, or null when it nests elements (those are not fitted). */
function plainText(children: React.ReactNode): string | null {
  let out = '';
  let plain = true;
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') out += String(child);
    else if (child !== null && child !== undefined && typeof child !== 'boolean') plain = false;
  });
  return plain ? out : null;
}

export function Txt({
  variant = 'body',
  color = 'text',
  upper,
  align,
  style,
  maxFontSizeMultiplier,
  adjustsFontSizeToFit,
  minimumFontScale,
  onLayout,
  ...rest
}: TxtProps): React.JSX.Element {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const isNumeral = variant === 'mega' || variant === 'hero';
  const maxScale = maxFontSizeMultiplier ?? (isNumeral ? numeralMaxFontScale : undefined);
  // Exact width available to this text, once a layout has shown it (see header).
  const [available, setAvailable] = useState<number | null>(null);

  const composed: StyleProp<TextStyle>[] = [
    type[variant],
    { color: theme.colors[color] },
    upper !== undefined && { textTransform: upper ? 'uppercase' : 'none' },
    align ? { textAlign: align } : null,
    style,
  ];

  const text = adjustsFontSizeToFit ? plainText(rest.children) : null;
  const flat: TextStyle | null = text !== null ? (StyleSheet.flatten(composed) ?? {}) : null;
  let fit: FitTextInput | null = null;
  if (flat && text !== null) {
    if (typeof flat.fontSize === 'number') {
      const fontVariant = flat.fontVariant;
      fit = {
        text,
        fontFamily: flat.fontFamily,
        fontSize: flat.fontSize,
        letterSpacing: flat.letterSpacing,
        tabular: Array.isArray(fontVariant) && fontVariant.includes('tabular-nums'),
        uppercase: flat.textTransform === 'uppercase',
        fontScale: rest.allowFontScaling === false ? 1 : Math.min(fontScale, maxScale ?? Infinity),
      };
    }
  }
  const lines = rest.numberOfLines ?? 1;
  const minScale = minimumFontScale ?? DEFAULT_MIN_SCALE;

  let fitted: TextStyle | null = null;
  if (fit && flat && available !== null) {
    const size = fitFontSize(fit, available, lines, minScale);
    if (size < fit.fontSize) {
      const ratio = size / fit.fontSize;
      fitted = {
        fontSize: size,
        lineHeight: flat.lineHeight !== undefined ? flat.lineHeight * ratio : undefined,
        letterSpacing: flat.letterSpacing !== undefined ? flat.letterSpacing * ratio : undefined,
      };
    }
  }

  const fitInput = fit;
  const handleLayout = (e: LayoutChangeEvent) => {
    onLayout?.(e);
    if (!fitInput) return;
    const width = e.nativeEvent.layout.width;
    setAvailable((prev) => {
      // Already known: a fitted text lays out at most that wide, so only a wider layout (the
      // room grew) changes it.
      if (prev !== null) return width > prev + 0.5 ? width : prev;
      const clipped = !fitsAt(fitInput, fitInput.fontSize, width + 0.5, lines);
      const stretched = (lineWidth(fitInput, fitInput.fontSize) ?? Infinity) < width - 1;
      return clipped || stretched ? width : null;
    });
  };

  return (
    <Text
      maxFontSizeMultiplier={maxScale}
      {...rest}
      onLayout={fit ? handleLayout : onLayout}
      // A text we could not fit in JS (nested elements, no numeric fontSize) keeps the native
      // behavior, floor and all.
      adjustsFontSizeToFit={adjustsFontSizeToFit && !fit}
      minimumFontScale={adjustsFontSizeToFit && !fit ? minimumFontScale : undefined}
      style={[...composed, fitted]}
    />
  );
}
