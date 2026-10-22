/**
 * One collapsible group in the Field Guide's filter sheet: a header row that shows the group's
 * title and, while closed, a one-line summary of what is selected in it. The header is a button
 * that reports its expanded state to screen readers; the body renders only while open.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, radius, space } from '../theme';
import { Icon, PressableScale, Txt } from '../ui';

export interface FilterSectionProps {
  testID: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function FilterSection({
  testID,
  title,
  summary,
  open,
  onToggle,
  children,
}: FilterSectionProps): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={open ? title : `${title}, ${summary}`}
        accessibilityState={{ expanded: open }}
        haptic={false}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Txt variant="h3">{title}</Txt>
          {!open && (
            <Txt testID={`${testID}-summary`} variant="small" color="text2" numberOfLines={1}>
              {summary}
            </Txt>
          )}
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color="text3" />
      </PressableScale>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.colors.line,
      backgroundColor: t.colors.surface,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    headerText: { flex: 1, gap: 2, marginRight: space.md },
    body: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg },
  }),
);
