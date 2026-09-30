/**
 * A screen-section heading: bold condensed `h2` with an optional accent icon, an optional
 * one-line caption beneath and an optional right-hand slot (a chip, an icon button). The tab
 * screens use it so Journey's sections read as siblings of the Workout screen's headings.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space, type ColorName } from '../theme';
import { Icon, Txt, type IconName } from '../ui';

export interface SectionTitleProps {
  title: string;
  icon?: IconName;
  tone?: ColorName;
  caption?: string;
  right?: React.ReactNode;
}

export function SectionTitle({
  title,
  icon,
  tone = 'text',
  caption,
  right,
}: SectionTitleProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.title}>
          {icon ? <Icon name={icon} size={20} color={tone} style={styles.icon} /> : null}
          <Txt variant="h2" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Txt>
        </View>
        {right}
      </View>
      {caption ? (
        <Txt variant="small" color="text2" style={styles.caption}>
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  icon: { marginRight: space.sm },
  caption: { marginTop: 2 },
});
