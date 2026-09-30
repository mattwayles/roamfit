/**
 * Pill label. `tone` picks an accent: tint background + accent text; `selected` flips to a solid
 * accent fill with `ink` text. With `onPress` it is a selectable filter/option (selection haptic).
 * `neutral` (default) is a `surface2` pill with secondary text.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tints, type AccentName } from '../theme';
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
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Chip({
  label,
  tone = 'neutral',
  selected = false,
  icon,
  leading,
  size = 'md',
  onPress,
  style,
  testID,
  accessibilityLabel,
}: ChipProps): React.JSX.Element {
  const accent = tone === 'neutral' ? colors.text : colors[tone];
  const bg = selected ? accent : tone === 'neutral' ? colors.surface2 : tints[tone];
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
      <Txt variant="eyebrow" color={textColor} numberOfLines={1}>
        {label}
      </Txt>
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected }}
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

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
  },
  md: { paddingHorizontal: space.md, paddingVertical: 7, minHeight: 30 },
  sm: { paddingHorizontal: space.sm + 2, paddingVertical: 4, minHeight: 24 },
  neutralBorder: { borderWidth: 1, borderColor: colors.line },
  gap: { marginRight: 6 },
});
