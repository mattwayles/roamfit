/** An icon in a tinted circle — banner leads, empty states, tile heads (DESIGN.md §5.1, §5.11). */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type AccentName } from '../theme';
import { Icon, type IconName } from '../ui';

export interface IconBadgeProps {
  icon: IconName;
  tone: AccentName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconBadge({ icon, tone, size = 40, style }: IconBadgeProps): React.JSX.Element {
  const { tints } = useTheme();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tints[tone] },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
