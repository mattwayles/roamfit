/**
 * The iOS-style grouped list Settings is built from (DESIGN.md §5.10), shared with the screens
 * Settings opens (Limitations, Training, Bands, Glossary…) and with onboarding, so every list of
 * choices in the app looks and reads the same.
 *
 * Every row is one VoiceOver element with a role and a state: a `SwitchRow` is a `switch` with
 * `checked`, a `CheckRow` a `checkbox` (or `radio`) with `checked`, a `NavRow` a `button` whose hint
 * says where it goes. The visual twins inside (the `Switch`, the check mark) are hidden from
 * VoiceOver, which already has the row.
 */
import React, { Children } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { makeStyles, radius, space, useTheme, type AccentName } from '../theme';
import { Card, Icon, Switch, Txt, haptics, type IconName } from '../ui';

/** Icon tile size, and how far a hairline separator is inset so it starts past the icon. */
const TILE = 32;
const ROW_PAD = space.lg;
const DIVIDER_INSET = ROW_PAD + TILE + space.md;

/** An iOS-style group: eyebrow above, a `surface` card of rows (hairlines between them), and an
 *  optional caption beneath. `testID` is `settings-section-${title}`. */
export function Group({
  title,
  caption,
  question = false,
  children,
}: {
  title: string;
  caption?: string;
  /** A full-sentence title (a question) reads as a sentence, not an uppercase eyebrow. */
  question?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group} testID={`settings-section-${title}`}>
      <Txt
        variant={question ? 'h3' : 'eyebrow'}
        color={question ? 'text' : 'text3'}
        accessibilityRole="header"
        style={styles.groupTitle}
      >
        {title}
      </Txt>
      <Card padding="none" style={styles.groupCard}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row}
          </React.Fragment>
        ))}
      </Card>
      {caption ? (
        <Txt variant="caption" color="text3" style={styles.groupCaption}>
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

/** The 32pt rounded-square icon tile, tinted in its group's accent. */
export function IconTile({ icon, tone }: { icon: IconName; tone: AccentName }): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.tile, { backgroundColor: theme.tints[tone] }]}>
      <Icon name={icon} size={18} color={tone} />
    </View>
  );
}

/** One switch row: tile, `h3` label, `Switch`. The row is the toggle (`testID`); the switch inside
 *  is a visual twin (hidden from VoiceOver, which already has the row) with its own id. */
export function SwitchRow({
  testID,
  icon,
  tone,
  label,
  value,
  onValueChange,
}: {
  testID: string;
  icon: IconName;
  tone: AccentName;
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        haptics.selection();
        onValueChange(!value);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <IconTile icon={icon} tone={tone} />
      <Txt variant="h3" style={styles.rowLabel}>
        {label}
      </Txt>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch testID={`${testID}-switch`} value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );
}

/** A row that opens another screen: tile, label, an optional current-value line, chevron. */
export function NavRow({
  testID,
  icon,
  tone,
  label,
  value,
  hint,
  onPress,
}: {
  testID: string;
  icon: IconName;
  tone: AccentName;
  label: string;
  /** The current setting in a few words ("Knee, Wrist"), shown under the label. */
  value?: string;
  /** VoiceOver hint: what happens on activate ("Opens your limitations"). */
  hint?: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={hint}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <IconTile icon={icon} tone={tone} />
      <View style={styles.rowText}>
        <Txt variant="h3">{label}</Txt>
        {value ? (
          <Txt variant="caption" color="text3" testID={`${testID}-value`}>
            {value}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevronRight" size={18} color="text3" />
    </Pressable>
  );
}

/** A selectable row with a label and a one-line description: a checkbox in a multi-select list,
 *  a radio button in a single-select one (`single`). The whole row is the target. */
export function CheckRow({
  testID,
  label,
  description,
  checked,
  single = false,
  disabled = false,
  onPress,
}: {
  testID: string;
  label: string;
  description?: string;
  checked: boolean;
  single?: boolean;
  /** Greyed out and inert, e.g. an option that needs another one first. */
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.checkText}>
        <Txt variant="h3">{label}</Txt>
        {description ? (
          <Txt variant="caption" color="text3">
            {description}
          </Txt>
        ) : null}
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.check, single && styles.checkRound, checked && styles.checkOn]}
      >
        {checked ? <Icon name="check" size={16} color="bg" /> : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((tk) =>
  StyleSheet.create({
    group: { gap: space.sm },
    groupTitle: { marginLeft: space.xs },
    groupCard: { overflow: 'hidden' },
    groupCaption: { marginHorizontal: space.xs },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: DIVIDER_INSET,
      backgroundColor: tk.colors.line,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingHorizontal: ROW_PAD,
      paddingVertical: space.sm,
    },
    rowPressed: { backgroundColor: tk.colors.surface2 },
    rowDisabled: { opacity: 0.4 },
    rowLabel: { flex: 1, flexShrink: 1, marginHorizontal: space.md },
    rowText: { flex: 1, flexShrink: 1, marginHorizontal: space.md, gap: 2 },
    checkText: { flex: 1, flexShrink: 1, marginRight: space.md, gap: 2 },
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    check: {
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: tk.colors.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkRound: { borderRadius: 13 },
    checkOn: { backgroundColor: tk.colors.teal, borderColor: tk.colors.teal },
  }),
);

export const SETTINGS_ROW_PAD = ROW_PAD;
