/**
 * `Eyebrow` — the small uppercase condensed label used above sections and cards.
 * `SectionHeader` — an Eyebrow with an optional leading icon and a right-aligned action link.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { space, type ColorName } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Txt, type TxtProps } from './Txt';

export function Eyebrow({
  color = 'text3',
  ...rest
}: Omit<TxtProps, 'variant'>): React.JSX.Element {
  return <Txt variant="eyebrow" color={color} {...rest} />;
}

export interface SectionHeaderProps {
  title: string;
  icon?: IconName;
  tone?: ColorName;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SectionHeader({
  title,
  icon,
  tone = 'text3',
  actionLabel,
  onAction,
  style,
  testID,
}: SectionHeaderProps): React.JSX.Element {
  return (
    <View testID={testID} style={[styles.row, style]}>
      <View style={styles.title}>
        {icon ? <Icon name={icon} size={16} color={tone} style={styles.icon} /> : null}
        <Eyebrow color={tone} accessibilityRole="header">
          {title}
        </Eyebrow>
      </View>
      {actionLabel && onAction ? (
        <PressableScale
          testID={testID ? `${testID}-action` : undefined}
          onPress={onAction}
          hitSlop={12}
          accessibilityLabel={actionLabel}
        >
          <Txt variant="eyebrow" color="ember">
            {actionLabel}
          </Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  icon: { marginRight: space.sm - 2 },
});
