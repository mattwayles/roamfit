/** A big condensed numeral over an eyebrow label, optional icon; `tone` colors icon + numeral. */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, space, type AccentName } from '../theme';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export interface StatTileProps {
  value: string | number;
  label: string;
  icon?: IconName;
  tone?: AccentName;
  /** Numeral size: `hero` (64) or `h1` (30) for dense grids. */
  size?: 'hero' | 'h1';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StatTile({
  value,
  label,
  icon,
  tone = 'pine',
  size = 'hero',
  style,
  testID,
}: StatTileProps): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.tile, style]}
    >
      {icon ? <Icon name={icon} size={18} color={tone} style={styles.icon} /> : null}
      <Txt
        variant={size}
        color={tone}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        testID={testID ? `${testID}-value` : undefined}
      >
        {value}
      </Txt>
      <Txt variant="eyebrow" color="text3" numberOfLines={1} style={styles.label}>
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    tile: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.lg,
      padding: space.lg,
      minWidth: 96,
      ...t.elevation.card,
    },
    icon: { marginBottom: space.xs },
    label: { marginTop: space.xs },
  }),
);
