/**
 * The Field Guide: the exercise library, browsable. Every exercise the app can ever program, in
 * one alphabetical list, with the search and filters needed to find one of 247 — and, deliberately,
 * Completed / never-done filters on the user's own history.
 *
 * Reads only: nothing on this screen generates, prescribes, or changes progression. A row's facts
 * are the exercise's name, the primary muscle it works, and how many tracked sessions it has
 * actually been completed in (`exercise_state.sessions_performed`, via the store).
 *
 * A `FlatList` rather than a `ScrollView`: the whole library mounts here, and the title, search box
 * and chip row ride along as `ListHeaderComponent` so the rows below stay virtualised. Rows are
 * deliberately cheap — plain views and one memoised muscle map (a single Svg of three merged
 * paths; no TopoPattern, no gradient) — since hundreds of them can be on screen while flinging.
 *
 * Layout only — the filtering itself is `lib/exerciseCatalog.ts` (pure, unit-tested) and every
 * read is a `@roamfit/store` repository call, per the "components render, screens decide, and
 * app/ writes no queries" convention this codebase already follows.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { exerciseCatalogRepo, usersRepo } from '@roamfit/store';
import type { Exercise, Focus } from '@roamfit/data';
import type { TabScreenProps } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock } from '../lib/localClock';
import {
  activeFilterCount,
  buildFilterOptions,
  EMPTY_FILTERS,
  type InjuryContext,
  filterExercises,
  MULTI_SELECT_KEYS,
  MULTI_SELECT_LABELS,
  primaryMuscleLabel,
  TOGGLE_KEYS,
  TOGGLE_LABELS,
  timesCompletedLabel,
  withBand,
  withNoGear,
} from '../lib/exerciseCatalog';
import type {
  ExerciseFilterState,
  MultiSelectKey,
  PerformedFilter,
  ToggleKey,
} from '../lib/exerciseCatalog';
import { filterValueLabel } from '../lib/filterLabels';
import {
  DEFAULT_OPEN_SECTIONS,
  FILTER_SECTION_ORDER,
  FILTER_SECTION_TITLES,
  MUSCLE_GROUPS,
  PATTERN_FAMILIES,
  sectionSummaries,
  selectionChips,
  toggleGroup,
} from '../lib/filterGroups';
import type { FilterGroup, FilterSectionId } from '../lib/filterGroups';
import { FOCUS_LABELS, FOCUS_TONE } from '../lib/focusLabels';
import {
  fontFamily,
  gutter,
  makeStyles,
  radius,
  space,
  type,
  useTheme,
  type AccentName,
} from '../theme';
import {
  Button,
  Chip,
  Enter,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  Sheet,
  Switch,
  Txt,
} from '../ui';
import { EmptyState } from '../components/EmptyState';
import { FilterSection } from '../components/FilterSection';
import { GroupedChips } from '../components/GroupedChips';
import { MuscleMap } from '../components/MuscleMap';

type Props = TabScreenProps<'Exercises'>;

type CatalogState = exerciseCatalogRepo.ExerciseCatalogState;

const PERFORMED_OPTIONS: { value: PerformedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'performed', label: 'Done' },
  { value: 'never', label: 'Not yet' },
];

/** Focus chips in the quick row: the five session focuses, in Generate's order. */
const QUICK_FOCUSES: Focus[] = ['upper', 'abs', 'legs', 'full', 'cardio'];

/** An avatar is tinted by the exercise's first focus (a `full` exercise that also trains `upper`
 *  reads as its headline focus). */
function avatarTone(exercise: Exercise): AccentName {
  return FOCUS_TONE[exercise.focus[0] ?? 'full'];
}

export default function ExercisesScreen({ navigation }: Props): React.JSX.Element {
  const { db, library } = useStore();
  const theme = useTheme();
  const styles = useStyles();
  const [catalog, setCatalog] = useState<Record<string, CatalogState>>({});
  // The limitations generation would use today (choices + unexpired pain reports), via the store.
  const [injury, setInjury] = useState<InjuryContext>({ limitations: [], today: '' });
  const [filters, setFilters] = useState<ExerciseFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Sheet layout state lives here, not in the sheet: the sheet's body unmounts when it closes, and
  // a reopened sheet should come back as the user left it.
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Re-read on focus: a session completed (or an exercise disabled) since has to be reflected
  // when the user comes back.
  useFocusEffect(
    useCallback(() => {
      setCatalog(exerciseCatalogRepo.getExerciseCatalogState(db));
      const { today } = nowEngineClock();
      setInjury({ limitations: usersRepo.buildUserProfile(db, today).limitations, today });
    }, [db]),
  );

  const options = useMemo(() => buildFilterOptions(library.exercises), [library]);
  const fallback = useMemo(() => exerciseCatalogRepo.emptyCatalogState(), []);
  const visible = useMemo(
    () => filterExercises(library.exercises, filters, catalog, fallback, injury),
    [library, filters, catalog, fallback, injury],
  );

  const appliedCount = activeFilterCount(filters);

  const toggleValue = (key: MultiSelectKey, value: string) => {
    setFilters((prev) => {
      const selected = prev[key] as string[];
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      return { ...prev, [key]: next } as ExerciseFilterState;
    });
  };

  const toggleSwitch = (key: ToggleKey) =>
    setFilters((prev) =>
      key === 'noGear' ? withNoGear(prev, !prev.noGear) : { ...prev, [key]: !prev[key] },
    );

  const toggleBand = () => setFilters((prev) => withBand(prev, !prev.equipment.includes('band')));

  const toggleSection = (id: FilterSectionId) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleExpanded = (dimension: string, groupId: string) => {
    const id = `${dimension}:${groupId}`;
    setExpandedGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };
  const expandedFor = (dimension: string) =>
    expandedGroups.filter((g) => g.startsWith(`${dimension}:`)).map((g) => g.split(':')[1]);

  const toggleFilterGroup = (key: 'primary' | 'pattern', group: FilterGroup) =>
    setFilters(
      (prev) =>
        ({ ...prev, [key]: toggleGroup(group, prev[key], options[key]) }) as ExerciseFilterState,
    );

  const removeValues = (key: MultiSelectKey, values: string[]) =>
    setFilters(
      (prev) =>
        ({
          ...prev,
          [key]: (prev[key] as string[]).filter((v) => !values.includes(v)),
        }) as ExerciseFilterState,
    );

  const summaries = useMemo(() => sectionSummaries(filters, options), [filters, options]);

  const clearAll = () => setFilters((prev) => ({ ...EMPTY_FILTERS, query: prev.query }));

  const setPerformed = (performed: PerformedFilter) =>
    setFilters((prev) => ({ ...prev, performed }));

  // Applied filters that the quick row has no chip for (equipment, muscle, ...) surface as
  // removable chips ahead of the quick ones, so nothing narrowing the list is ever hidden in the
  // sheet.
  // Body area and movement patterns collapse a fully-selected family to one chip under its name.
  const GROUPS_FOR: Partial<Record<MultiSelectKey, readonly FilterGroup[]>> = {
    primary: MUSCLE_GROUPS,
    pattern: PATTERN_FAMILIES,
  };
  const appliedExtras = MULTI_SELECT_KEYS.filter((key) => key !== 'focus').flatMap((key) => {
    const groups = GROUPS_FOR[key];
    const chips = groups
      ? selectionChips(groups, filters[key] as string[], options[key], (v) =>
          filterValueLabel(key, v),
        )
      : (filters[key] as string[]).map((value) => ({
          id: value,
          label: filterValueLabel(key, value),
          values: [value],
        }));
    return chips.map((chip) => ({
      id: `${key}-${chip.id}`,
      label: chip.label,
      group: MULTI_SELECT_LABELS[key],
      remove: () => removeValues(key, chip.values),
    }));
  });
  // "No gear" has its own quick chip, so only the other two switches ride along here.
  const appliedSwitches = TOGGLE_KEYS.filter((key) => key !== 'noGear' && filters[key]).map(
    (key) => ({
      id: key,
      label: TOGGLE_LABELS[key],
      group: 'Filter',
      remove: () => toggleSwitch(key),
    }),
  );

  // Disabled with nothing saved — unless it is already on (limitations cleared since), so it can
  // always be turned off.
  const hasLimitations = injury.limitations.length > 0 || filters.suitsLimitations;
  const noneSaved = injury.limitations.length === 0;
  const moveCount = visible.length;

  const header = (
    <View style={styles.header}>
      <Enter style={styles.headerTitle}>
        <Txt variant="eyebrow" color="gold">
          Every move we know
        </Txt>
        <View style={styles.headerTop}>
          <Txt variant="display" accessibilityRole="header" style={styles.title}>
            Field guide
          </Txt>
          <Txt testID="exercise-count" variant="h2" color="text2">
            {moveCount}
            {moveCount === 1 ? ' move' : ' moves'}
          </Txt>
          {/* Settings is reachable from every tab, as on Today. */}
          <IconButton
            testID="guide-open-settings"
            icon="settings"
            accessibilityLabel="Settings"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
      </Enter>

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color="text3" style={styles.searchIcon} />
        <TextInput
          testID="exercise-search"
          style={styles.search}
          value={filters.query}
          onChangeText={(query) => setFilters((prev) => ({ ...prev, query }))}
          placeholder="Search moves"
          placeholderTextColor={theme.colors.text3}
          selectionColor={theme.colors.teal}
          keyboardAppearance={theme.scheme}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search exercises"
        />
        {filters.query.length > 0 && (
          <PressableScale
            testID="clear-search"
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={12}
            style={styles.clearSearch}
            onPress={() => setFilters((prev) => ({ ...prev, query: '' }))}
          >
            <Icon name="close" size={14} color="ink" />
          </PressableScale>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        <PressableScale
          testID="toggle-filters"
          accessibilityRole="button"
          accessibilityLabel={appliedCount > 0 ? `Filters, ${appliedCount} applied` : 'Filters'}
          onPress={() => setFiltersOpen(true)}
          style={[styles.filterButton, appliedCount > 0 && styles.filterButtonActive]}
        >
          <Icon name="filter" size={16} color={appliedCount > 0 ? 'teal' : 'text2'} />
          <Txt
            variant="eyebrow"
            color={appliedCount > 0 ? 'teal' : 'text2'}
            style={styles.filterLabel}
          >
            Filters
          </Txt>
          {appliedCount > 0 && (
            <View style={styles.badge}>
              <Txt testID="filters-badge" variant="eyebrow" color="ink" style={styles.badgeText}>
                {appliedCount}
              </Txt>
            </View>
          )}
        </PressableScale>

        {[...appliedExtras, ...appliedSwitches].map(({ id, label, group, remove }) => (
          <Chip
            key={id}
            testID={`active-filter-${id}`}
            label={label}
            icon="close"
            tone="teal"
            selected
            accessibilityLabel={`Remove filter ${group}: ${label}`}
            onPress={remove}
          />
        ))}

        {QUICK_FOCUSES.filter((f) => options.focus.includes(f)).map((f) => (
          <Chip
            key={f}
            testID={`quick-filter-focus-${f}`}
            label={FOCUS_LABELS[f]}
            tone={FOCUS_TONE[f]}
            selected={filters.focus.includes(f)}
            onPress={() => toggleValue('focus', f)}
          />
        ))}
        <Chip
          testID="quick-filter-no-gear"
          label={TOGGLE_LABELS.noGear}
          tone={filters.noGear ? 'teal' : 'neutral'}
          selected={filters.noGear}
          onPress={() => toggleSwitch('noGear')}
        />
        <Chip
          testID="quick-filter-completed"
          label="Completed"
          tone={filters.performed === 'performed' ? 'teal' : 'neutral'}
          selected={filters.performed === 'performed'}
          onPress={() => setPerformed(filters.performed === 'performed' ? 'all' : 'performed')}
        />
      </ScrollView>

      {appliedCount > 0 && (
        <PressableScale
          testID="clear-filters-inline"
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          hitSlop={8}
          style={styles.clearInline}
          onPress={clearAll}
        >
          <Icon name="close" size={14} color="teal" />
          <Txt variant="eyebrow" color="teal" style={styles.clearInlineText}>
            Clear filters
          </Txt>
        </PressableScale>
      )}
    </View>
  );

  return (
    <Screen
      edges={['top', 'left', 'right']}
      safeBottom={false}
      padded={false}
      testID="exercises-screen"
    >
      <FlatList
        testID="exercise-list"
        data={visible}
        keyExtractor={(exercise) => exercise.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // The library is fixed-size and every row is the same height, so the default windowing is
        // more than enough; nothing here needs a measured-layout optimisation.
        ListEmptyComponent={
          <EmptyState
            testID="exercise-empty"
            icon="search"
            tone="gold"
            title="No moves match yet"
            body="Loosen a filter or try another word — there's a lot more in the guide."
            actionLabel={appliedCount > 0 ? 'Clear filters' : undefined}
            onAction={appliedCount > 0 ? clearAll : undefined}
          />
        }
        renderItem={({ item }) => (
          <ExerciseRow
            exercise={item}
            state={catalog[item.id] ?? fallback}
            onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
          />
        )}
      />

      <Sheet testID="filter-panel" visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <View style={styles.sheetHeader}>
          <Txt variant="h2" accessibilityRole="header">
            Filters
          </Txt>
          {appliedCount > 0 && (
            <PressableScale
              testID="clear-filters"
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              hitSlop={10}
              onPress={clearAll}
            >
              <Txt variant="eyebrow" color="teal">
                Clear all
              </Txt>
            </PressableScale>
          )}
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
          {FILTER_SECTION_ORDER.map((id) => (
            <FilterSection
              key={id}
              testID={`filter-section-${id}`}
              title={FILTER_SECTION_TITLES[id]}
              summary={summaries[id]}
              open={openSections[id]}
              onToggle={() => toggleSection(id)}
            >
              {id === 'works' && (
                <>
                  <ChipGroup label="Focus">
                    {options.focus.map((value) => (
                      <ValueChip
                        key={value}
                        dimension="focus"
                        value={value}
                        selected={filters.focus.includes(value as Focus)}
                        onPress={() => toggleValue('focus', value)}
                      />
                    ))}
                  </ChipGroup>
                  <View style={styles.filterGroup}>
                    <Txt variant="eyebrow" color="text3">
                      {MULTI_SELECT_LABELS.primary}
                    </Txt>
                    <GroupedChips
                      dimension="primary"
                      groups={MUSCLE_GROUPS}
                      available={options.primary}
                      selected={filters.primary}
                      labelFor={(v) => filterValueLabel('primary', v)}
                      expanded={expandedFor('primary')}
                      onToggleGroup={(g) => toggleFilterGroup('primary', g)}
                      onToggleValue={(v) => toggleValue('primary', v)}
                      onToggleExpanded={(g) => toggleExpanded('primary', g)}
                    />
                  </View>
                </>
              )}
              {id === 'moves' && (
                <GroupedChips
                  dimension="pattern"
                  groups={PATTERN_FAMILIES}
                  available={options.pattern}
                  selected={filters.pattern}
                  labelFor={(v) => filterValueLabel('pattern', v)}
                  expanded={expandedFor('pattern')}
                  onToggleGroup={(g) => toggleFilterGroup('pattern', g)}
                  onToggleValue={(v) => toggleValue('pattern', v)}
                  onToggleExpanded={(g) => toggleExpanded('pattern', g)}
                />
              )}
              {id === 'need' && (
                <>
                  {/* One choice, not a list: the same "no gear" the quick chip applies. */}
                  <ChipGroup label="Gear">
                    <Chip
                      testID="filter-toggle-noGear"
                      label={TOGGLE_LABELS.noGear}
                      tone={filters.noGear ? 'teal' : 'neutral'}
                      selected={filters.noGear}
                      onPress={() => toggleSwitch('noGear')}
                    />
                    <Chip
                      testID="filter-equipment-band"
                      label="Band"
                      tone={filters.equipment.includes('band') ? 'teal' : 'neutral'}
                      selected={filters.equipment.includes('band')}
                      onPress={toggleBand}
                    />
                  </ChipGroup>
                  <ChipGroup label={MULTI_SELECT_LABELS.anchor}>
                    {options.anchor.map((value) => (
                      <ValueChip
                        key={value}
                        dimension="anchor"
                        value={value}
                        selected={filters.anchor.includes(value as never)}
                        onPress={() => toggleValue('anchor', value)}
                      />
                    ))}
                  </ChipGroup>
                </>
              )}
              {id === 'fit' && (
                <>
                  <ChipGroup label={MULTI_SELECT_LABELS.difficulty}>
                    {options.difficulty.map((value) => (
                      <ValueChip
                        key={value}
                        dimension="difficulty"
                        value={value}
                        selected={filters.difficulty.includes(value as never)}
                        onPress={() => toggleValue('difficulty', value)}
                      />
                    ))}
                  </ChipGroup>
                  <ChipGroup label={MULTI_SELECT_LABELS.laterality}>
                    {options.laterality.map((value) => (
                      <ValueChip
                        key={value}
                        dimension="laterality"
                        value={value}
                        selected={filters.laterality.includes(value as never)}
                        onPress={() => toggleValue('laterality', value)}
                      />
                    ))}
                  </ChipGroup>
                  <FilterRow
                    testIdPrefix="filter-performed"
                    label="Your history"
                    options={PERFORMED_OPTIONS}
                    value={filters.performed}
                    onChange={setPerformed}
                  />
                  <View style={styles.filterGroup}>
                    <Pressable
                      testID="filter-toggle-suitsLimitations"
                      accessibilityRole="switch"
                      accessibilityLabel="Hide moves that don't suit my limitations"
                      accessibilityState={{
                        checked: filters.suitsLimitations,
                        disabled: !hasLimitations,
                      }}
                      disabled={!hasLimitations}
                      onPress={() => toggleSwitch('suitsLimitations')}
                      style={[styles.switchRow, !hasLimitations && styles.switchRowOff]}
                    >
                      <Txt variant="body" style={styles.switchLabel}>
                        Hide moves that don't suit my limitations
                      </Txt>
                      <Switch
                        value={filters.suitsLimitations}
                        disabled={!hasLimitations}
                        onValueChange={() => toggleSwitch('suitsLimitations')}
                        accessibilityLabel="Hide moves that don't suit my limitations"
                      />
                    </Pressable>
                    {noneSaved && (
                      <View style={styles.switchNote}>
                        <Txt testID="no-limitations-note" variant="caption" color="text2">
                          No limitations saved.
                        </Txt>
                        <PressableScale
                          testID="edit-limitations"
                          accessibilityRole="link"
                          accessibilityLabel="Add limitations in Settings"
                          hitSlop={8}
                          onPress={() => {
                            setFiltersOpen(false);
                            navigation.navigate('Limitations');
                          }}
                        >
                          <Txt variant="caption" color="teal">
                            Add some in Settings
                          </Txt>
                        </PressableScale>
                      </View>
                    )}
                  </View>
                  <ChipGroup label="Also">
                    {(['timedHolds', 'onLadder'] as const).map((key) => (
                      <Chip
                        key={key}
                        testID={`filter-toggle-${key}`}
                        label={TOGGLE_LABELS[key]}
                        tone={filters[key] ? 'teal' : 'neutral'}
                        selected={filters[key]}
                        onPress={() => toggleSwitch(key)}
                      />
                    ))}
                  </ChipGroup>
                </>
              )}
            </FilterSection>
          ))}
        </ScrollView>

        {/* Live count; with nothing matching it still closes, and says so without a dead end. */}
        <Button
          testID="filters-done"
          label={
            moveCount === 0
              ? 'No moves match'
              : `Show ${moveCount} ${moveCount === 1 ? 'move' : 'moves'}`
          }
          onPress={() => setFiltersOpen(false)}
          style={styles.sheetDone}
        />
      </Sheet>
    </Screen>
  );
}

function ChipGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.filterGroup}>
      <Txt variant="eyebrow" color="text3">
        {label}
      </Txt>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

/** One chip of a flat multi-select dimension, labelled in plain words. */
function ValueChip({
  dimension,
  value,
  selected,
  onPress,
}: {
  dimension: MultiSelectKey;
  value: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Chip
      testID={`filter-${dimension}-${value}`}
      label={filterValueLabel(dimension, value)}
      tone={selected ? 'teal' : 'neutral'}
      selected={selected}
      onPress={onPress}
    />
  );
}

function FilterRow<T extends string>({
  testIdPrefix,
  label,
  options,
  value,
  onChange,
}: {
  testIdPrefix: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.filterGroup}>
      <Txt variant="eyebrow" color="text3">
        {label}
      </Txt>
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Chip
              key={option.value}
              testID={`${testIdPrefix}-${option.value}`}
              label={option.label}
              tone={selected ? 'teal' : 'neutral'}
              selected={selected}
              onPress={() => onChange(option.value)}
            />
          );
        })}
      </View>
    </View>
  );
}

/** The muscle-map tile: one figure, centred in a tinted rounded square. */
const AVATAR = 52;
const MAP_HEIGHT = 46;

const ExerciseRow = React.memo(function ExerciseRow({
  exercise,
  state,
  onPress,
}: {
  exercise: Exercise;
  state: CatalogState;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const tone = avatarTone(exercise);
  const done = state.timesCompleted > 0;
  return (
    <PressableScale
      testID={`exercise-card-${exercise.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${primaryMuscleLabel(exercise)}, ${timesCompletedLabel(
        state.timesCompleted,
      )}`}
      haptic={false}
      style={[styles.row, state.disabled && styles.rowDisabled]}
      onPress={onPress}
    >
      <View style={[styles.avatar, { backgroundColor: theme.tints[tone] }]}>
        <MuscleMap exercise={exercise} height={MAP_HEIGHT} accent={tone} />
      </View>
      <View style={styles.rowMain}>
        <Txt variant="h3" numberOfLines={2}>
          {exercise.name}
        </Txt>
        <Txt variant="small" color="text2" numberOfLines={2}>
          {primaryMuscleLabel(exercise)}
        </Txt>
      </View>
      <View style={styles.rowMeta}>
        {done ? (
          <Chip
            testID={`exercise-card-count-${exercise.id}`}
            label={`×${state.timesCompleted}`}
            tone="teal"
            size="sm"
            accessibilityLabel={timesCompletedLabel(state.timesCompleted)}
          />
        ) : (
          // "Not done yet" is a quiet fact, not a chip: a wall of muted pills is exactly the
          // boring list this screen replaced. It is still the count's testID, so it stays queryable.
          <Txt testID={`exercise-card-count-${exercise.id}`} variant="caption" color="text3">
            {timesCompletedLabel(0)}
          </Txt>
        )}
        {/* The toggle itself lives on the detail screen (one source of truth) — this is just the
            at-a-glance signal that a workout will never pick this exercise right now. */}
        {state.disabled && (
          <Chip testID={`exercise-card-disabled-${exercise.id}`} label="Disabled" size="sm" />
        )}
      </View>
    </PressableScale>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    container: { paddingBottom: space.huge + space.xxl, gap: space.sm },
    header: {
      paddingHorizontal: gutter,
      paddingTop: space.lg,
      paddingBottom: space.sm,
      gap: space.lg,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { gap: space.xs },
    title: { flexShrink: 1 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
      paddingHorizontal: space.lg,
    },
    searchIcon: { marginRight: space.sm },
    search: {
      flex: 1,
      minHeight: 46,
      ...type.body,
      fontFamily: fontFamily.bodyMedium,
      color: t.colors.text,
    },
    clearSearch: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: t.colors.text3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipScroll: { marginHorizontal: -gutter, flexGrow: 0 },
    chipRow: { paddingHorizontal: gutter, gap: space.sm, alignItems: 'center' },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 30,
      paddingHorizontal: space.md,
      paddingVertical: 7,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.lineStrong,
    },
    filterButtonActive: { backgroundColor: t.tints.teal, borderColor: t.colors.teal },
    filterLabel: { marginLeft: 6 },
    badge: {
      marginLeft: 6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: t.colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Tracking/leading override on a Txt variant: eyebrow spacing would not fit the 16pt count badge.
    badgeText: { letterSpacing: 0, lineHeight: 16 },
    clearInline: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
    clearInlineText: { marginLeft: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: gutter,
      padding: space.md,
      minHeight: 76,
      borderRadius: radius.lg,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
      ...t.elevation.card,
    },
    rowDisabled: { opacity: 0.5 },
    avatar: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    rowMain: { flex: 1, gap: 2 },
    rowMeta: { alignItems: 'flex-end', gap: space.xs, marginLeft: space.sm },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.lg,
    },
    sheetScroll: { flexGrow: 0 },
    sheetBody: { gap: space.xl, paddingBottom: space.md },
    filterGroup: { gap: space.sm },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    switchRowOff: { opacity: 0.5 },
    switchLabel: { flex: 1 },
    switchNote: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    sheetDone: { marginTop: space.lg },
  }),
);
