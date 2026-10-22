/**
 * A chip group whose values are collapsed into a few families (body areas, movement families).
 * A family chip selects or clears all its members; a chevron beside a multi-member family opens
 * its individual chips. A partly-selected family reads as a tinted chip with a count, a fully
 * selected one as a solid chip, so "some of Legs" never looks like "all of Legs".
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Chip, Icon, PressableScale, Txt } from '../ui';
import { availableMembers, groupSelection, type FilterGroup } from '../lib/filterGroups';

export interface GroupedChipsProps {
  /** Filter dimension key — prefixes every testID. */
  dimension: string;
  groups: readonly FilterGroup[];
  /** Values the library has. */
  available: readonly string[];
  selected: readonly string[];
  labelFor: (value: string) => string;
  /** Group ids currently expanded to their member chips. */
  expanded: readonly string[];
  onToggleGroup: (group: FilterGroup) => void;
  onToggleValue: (value: string) => void;
  onToggleExpanded: (groupId: string) => void;
}

export function GroupedChips({
  dimension,
  groups,
  available,
  selected,
  labelFor,
  expanded,
  onToggleGroup,
  onToggleValue,
  onToggleExpanded,
}: GroupedChipsProps): React.JSX.Element {
  const styles = useStyles();
  const visibleGroups = groups.filter((g) => availableMembers(g, available).length > 0);
  return (
    <View style={styles.wrap}>
      <View style={styles.chipWrap}>
        {visibleGroups.map((group) => {
          const members = availableMembers(group, available);
          const state = groupSelection(group, selected, available);
          const count = members.filter((m) => selected.includes(m)).length;
          const multi = members.length > 1;
          const open = expanded.includes(group.id);
          return (
            <View key={group.id} style={styles.groupChip}>
              <Chip
                testID={`filter-group-${dimension}-${group.id}`}
                label={
                  state === 'partial' ? `${group.label} ${count}/${members.length}` : group.label
                }
                tone={state === 'none' ? 'neutral' : 'teal'}
                selected={state === 'all'}
                accessibilityLabel={
                  state === 'partial'
                    ? `${group.label}, ${count} of ${members.length} selected`
                    : group.label
                }
                onPress={() => onToggleGroup(group)}
              />
              {multi && (
                <PressableScale
                  testID={`filter-expand-${dimension}-${group.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${open ? 'Hide' : 'Show'} ${group.label} individually`}
                  accessibilityState={{ expanded: open }}
                  haptic={false}
                  hitSlop={8}
                  onPress={() => onToggleExpanded(group.id)}
                  style={styles.expand}
                >
                  <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} color="text3" />
                </PressableScale>
              )}
            </View>
          );
        })}
      </View>
      {visibleGroups
        .filter((g) => expanded.includes(g.id) && availableMembers(g, available).length > 1)
        .map((group) => (
          <View key={group.id} style={styles.members}>
            <Txt variant="eyebrow" color="text3">
              {group.label}
            </Txt>
            <View style={styles.chipWrap}>
              {availableMembers(group, available).map((value) => {
                const isSelected = selected.includes(value);
                return (
                  <Chip
                    key={value}
                    testID={`filter-${dimension}-${value}`}
                    label={labelFor(value)}
                    size="sm"
                    tone={isSelected ? 'teal' : 'neutral'}
                    selected={isSelected}
                    onPress={() => onToggleValue(value)}
                  />
                );
              })}
            </View>
          </View>
        ))}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { gap: space.md },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    groupChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    expand: { padding: space.xs },
    members: { gap: space.sm },
  }),
);
