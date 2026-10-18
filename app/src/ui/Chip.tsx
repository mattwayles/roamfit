/**
 * Pill label. `tone` picks an accent: tint background + accent text; `selected` flips to a solid
 * accent fill with `ink` text. With `onPress` it is a selectable filter/option (selection haptic).
 * `neutral` (default) is a `surface2` pill with secondary text.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, space, useTheme, type AccentName } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

export interface ChipProps {
  label: string;
  tone?: AccentName | 'neutral';
  selected?: boolean;
  icon?: IconName;
  /** Custom leading element, e.g. a band color dot. */
  leading?: React.ReactNode;
  size?: 'md' | 'sm';
  /** Let a long label wrap onto more lines instead of truncating (e.g. a milestone sentence). */
  wrap?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/** Vertical slop that brings each chip size's touch target to 44pt (horizontal is ample). */
const CHIP_HIT_SLOP = { md: { top: 7, bottom: 7 }, sm: { top: 10, bottom: 10 } } as const;

export function Chip({
  label,
  tone = 'neutral',
  selected = false,
  icon,
  leading,
  size = 'md',
  wrap = false,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: ChipProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const accent = tone === 'neutral' ? theme.colors.text : theme.colors[tone];
  const bg = selected ? accent : tone === 'neutral' ? theme.colors.surface2 : theme.tints[tone];
  const textColor = selected ? 'ink' : tone === 'neutral' ? 'text2' : tone;

  const containerStyle = [
    styles.chip,
    size === 'sm' ? styles.sm : styles.md,
    { backgroundColor: bg },
    tone === 'neutral' && !selected && styles.neutralBorder,
    style,
  ];
  const body = (
    <>
      {leading ? <View style={styles.gap}>{leading}</View> : null}
      {icon ? (
        <Icon name={icon} size={size === 'sm' ? 12 : 14} color={textColor} style={styles.gap} />
      ) : null}
      <Txt
        variant="eyebrow"
        color={textColor}
        numberOfLines={wrap ? undefined : 1}
        style={wrap ? styles.wrapText : undefined}
      >
        {label}
      </Txt>
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected }}
        // Track 37n — the chip is drawn 24-30pt tall; the touch area reaches the 44pt minimum.
        hitSlop={CHIP_HIT_SLOP[size]}
        style={containerStyle}
      >
        {body}
      </PressableScale>
    );
  }
  return (
    <View
      testID={testID}
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
      style={containerStyle}
    >
      {body}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '100%',
      borderRadius: radius.pill,
    },
    md: { paddingHorizontal: space.md, paddingVertical: 7, minHeight: 30 },
    sm: { paddingHorizontal: space.sm + 2, paddingVertical: 4, minHeight: 24 },
    neutralBorder: { borderWidth: 1, borderColor: t.colors.line },
    gap: { marginRight: 6 },
    wrapText: { flexShrink: 1 },
  }),
);
