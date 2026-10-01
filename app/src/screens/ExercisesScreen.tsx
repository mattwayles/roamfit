/**
 * The Field Guide: the exercise library, browsable. Every exercise the app can ever program, in
 * one alphabetical list, with the search and filters needed to find one of 247 — and, deliberately,
 * a "needs a video" filter, because populating demo links is a real job someone does in bulk and
 * the list is the only place that job is visible.
 *
 * Reads only: nothing on this screen generates, prescribes, or changes progression. A row's facts
 * are the exercise's name, the primary muscle it works, and how many tracked sessions it has
 * actually been completed in (`exercise_state.sessions_performed`, via the store).
 *
 * A `FlatList` rather than a `ScrollView`: the whole library mounts here, and the title, search box
 * and chip row ride along as `ListHeaderComponent` so the rows below stay virtualised. Rows are
 * deliberately cheap — plain views and one icon glyph, no SVG (no TopoPattern, no gradient) — since
 * hundreds of them can be on screen while flinging.
 *
 * Layout only — the filtering itself is `lib/exerciseCatalog.ts` (pure, unit-tested) and every
 * read is a `@roamfit/store` repository call, per the "components render, screens decide, and
 * app/ writes no queries" convention this codebase already follows.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { exerciseCatalogRepo } from '@roamfit/store';
import type { Exercise, Focus, Pattern } from '@roamfit/data';
import type { TabScreenProps } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import {
  activeFilterCount,
  buildFilterOptions,
  EMPTY_FILTERS,
  filterExercises,
  formatToken,
  MULTI_SELECT_KEYS,
  MULTI_SELECT_LABELS,
  primaryMuscleLabel,
  timesCompletedLabel,
} from '../lib/exerciseCatalog';
import type {
  ExerciseFilterState,
  MultiSelectKey,
  PerformedFilter,
  VideoFilter,
} from '../lib/exerciseCatalog';
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
  PressableScale,
  Screen,
  Sheet,
  Txt,
  type IconName,
} from '../ui';
import { EmptyState } from '../components/EmptyState';

type Props = TabScreenProps<'Exercises'>;

type CatalogState = exerciseCatalogRepo.ExerciseCatalogState;

const VIDEO_OPTIONS: { value: VideoFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'has_video', label: 'Has video' },
  { value: 'needs_video', label: 'Needs video' },
];

const PERFORMED_OPTIONS: { value: PerformedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'performed', label: 'Completed' },
  { value: 'never', label: 'Not yet' },
];

/** Focus chips in the quick row: the five session focuses, in Generate's order. */
const QUICK_FOCUSES: Focus[] = ['upper', 'abs', 'legs', 'full', 'cardio'];

/** The one place a movement pattern picks its avatar glyph (DESIGN.md §5.3): pushes and pulls point
 *  the way the load travels, squat/hinge/leg work is a body, trunk work is the core dot, and
 *  conditioning is a pulse. Every `Pattern` the library carries must appear here (the type makes
 *  a new one a compile error). */
const PATTERN_ICON: Record<Pattern, IconName> = {
  horizontal_push: 'push',
  vertical_push: 'up',
  shoulder_isolation: 'fitness',
  vertical_pull: 'down',
  horizontal_pull: 'pull',
  elbow_flexion: 'barbell',
  elbow_extension: 'barbell',
  squat: 'body',
  lunge: 'walk',
  hinge: 'body',
  knee_flexion: 'walk',
  knee_extension: 'walk',
  abduction: 'swap',
  calf: 'walk',
  hip_extension: 'body',
  anti_rotation: 'core',
  flexion: 'core',
  anti_extension: 'core',
  lateral_flexion: 'core',
  conditioning: 'pulse',
};

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
  const [filters, setFilters] = useState<ExerciseFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Re-read on focus: a video assigned on the detail page (or a session completed since) has to be
  // reflected when the user comes back, which is exactly the flow of populating links one by one.
  useFocusEffect(
    useCallback(() => {
      setCatalog(exerciseCatalogRepo.getExerciseCatalogState(db));
    }, [db]),
  );

  const options = useMemo(() => buildFilterOptions(library.exercises), [library]);
  const fallback = useMemo(() => exerciseCatalogRepo.emptyCatalogState(), []);
  const visible = useMemo(
    () => filterExercises(library.exercises, filters, catalog, fallback),
    [library, filters, catalog, fallback],
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

  const clearAll = () => setFilters((prev) => ({ ...EMPTY_FILTERS, query: prev.query }));

  const setVideo = (video: VideoFilter) => setFilters((prev) => ({ ...prev, video }));
  const setPerformed = (performed: PerformedFilter) =>
    setFilters((prev) => ({ ...prev, performed }));

  // Applied filters that the quick row has no chip for (equipment, muscle, ...) surface as
  // removable chips ahead of the quick ones, so nothing narrowing the list is ever hidden in the
  // sheet.
  const appliedExtras = MULTI_SELECT_KEYS.filter((key) => key !== 'focus').flatMap((key) =>
    (filters[key] as string[]).map((value) => ({ key, value })),
  );

  const moveCount = visible.length;

  const header = (
    <View style={styles.header}>
      <Enter>
        <Txt variant="eyebrow" color="gold">
          Every move we know
        </Txt>
        <View style={styles.titleRow}>
          <Txt variant="display" accessibilityRole="header" style={styles.title}>
            Field guide
          </Txt>
          <Txt testID="exercise-count" variant="h2" color="text2" style={styles.count}>
            {moveCount}
            {moveCount === 1 ? ' move' : ' moves'}
          </Txt>
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
          selectionColor={theme.colors.ember}
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
          <Icon name="filter" size={16} color={appliedCount > 0 ? 'ember' : 'text2'} />
          <Txt
            variant="eyebrow"
            color={appliedCount > 0 ? 'ember' : 'text2'}
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

        {appliedExtras.map(({ key, value }) => (
          <Chip
            key={`${key}:${value}`}
            testID={`active-filter-${key}-${value}`}
            label={formatToken(value)}
            icon="close"
            tone="ember"
            selected
            accessibilityLabel={`Remove filter ${MULTI_SELECT_LABELS[key]}: ${formatToken(value)}`}
            onPress={() => toggleValue(key, value)}
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
          testID="quick-filter-needs-video"
          label="Needs video"
          tone={filters.video === 'needs_video' ? 'ember' : 'neutral'}
          selected={filters.video === 'needs_video'}
          onPress={() => setVideo(filters.video === 'needs_video' ? 'all' : 'needs_video')}
        />
        <Chip
          testID="quick-filter-completed"
          label="Completed"
          tone={filters.performed === 'performed' ? 'ember' : 'neutral'}
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
          <Icon name="close" size={14} color="ember" />
          <Txt variant="eyebrow" color="ember" style={styles.clearInlineText}>
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
              <Txt variant="eyebrow" color="ember">
                Clear all
              </Txt>
            </PressableScale>
          )}
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
          {/* The two dimensions that aren't properties of the exercise record — they're facts
              about this user's own state — sit first, as single-choice rows. "Needs video" is the
              one people come here for. */}
          <FilterRow
            testIdPrefix="filter-video"
            label="Demo video"
            options={VIDEO_OPTIONS}
            value={filters.video}
            onChange={setVideo}
          />
          <FilterRow
            testIdPrefix="filter-performed"
            label="Your history"
            options={PERFORMED_OPTIONS}
            value={filters.performed}
            onChange={setPerformed}
          />

          {MULTI_SELECT_KEYS.map((key) => (
            <View key={key} style={styles.filterGroup}>
              <Txt variant="eyebrow" color="text3">
                {MULTI_SELECT_LABELS[key]}
              </Txt>
              <View style={styles.chipWrap}>
                {options[key].map((value) => {
                  const selected = (filters[key] as string[]).includes(value);
                  return (
                    <Chip
                      key={value}
                      testID={`filter-${key}-${value}`}
                      label={formatToken(value)}
                      tone={selected ? 'ember' : 'neutral'}
                      selected={selected}
                      onPress={() => toggleValue(key, value)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        <Button
          testID="filters-done"
          label={`Show ${moveCount} ${moveCount === 1 ? 'move' : 'moves'}`}
          onPress={() => setFiltersOpen(false)}
          style={styles.sheetDone}
        />
      </Sheet>
    </Screen>
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
              tone={selected ? 'ember' : 'neutral'}
              selected={selected}
              onPress={() => onChange(option.value)}
            />
          );
        })}
      </View>
    </View>
  );
}

const AVATAR = 52;

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
        <Icon name={PATTERN_ICON[exercise.pattern]} size={24} color={tone} />
      </View>
      <View style={styles.rowMain}>
        <Txt variant="h3" numberOfLines={2}>
          {exercise.name}
        </Txt>
        <Txt variant="small" color="text2" numberOfLines={1}>
          {primaryMuscleLabel(exercise)}
        </Txt>
      </View>
      <View style={styles.rowMeta}>
        {done ? (
          <Chip
            testID={`exercise-card-count-${exercise.id}`}
            label={`×${state.timesCompleted}`}
            tone="ember"
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
        {/* A quiet marker, not a warning: it is the operator's to-do list, and an exercise
            without a curated clip still teaches fine from its "How to" cue (ADR 0008). */}
        {!state.hasVideo && (
          <Chip testID={`exercise-card-no-video-${exercise.id}`} label="No video" size="sm" />
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
    titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    title: { flexShrink: 1 },
    count: { marginLeft: space.md },
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
    filterButtonActive: { backgroundColor: t.tints.ember, borderColor: t.colors.ember },
    filterLabel: { marginLeft: 6 },
    badge: {
      marginLeft: 6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: t.colors.ember,
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
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    sheetDone: { marginTop: space.lg },
  }),
);
