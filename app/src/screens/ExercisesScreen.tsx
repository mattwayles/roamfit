/**
 * The exercise library, browsable. Every exercise the app can ever program, in one alphabetical
 * list, with the search and filters needed to find one of 219 — and, deliberately, a "needs a
 * video" filter, because populating demo links is a real job someone does in bulk and the list is
 * the only place that job is visible.
 *
 * Reads only: nothing on this screen generates, prescribes, or changes progression. The card's
 * three facts are the exercise's name, the primary muscle it works, and how many tracked sessions
 * it has actually been completed in (`exercise_state.sessions_performed`, via the store).
 *
 * A `FlatList` rather than a `ScrollView`: the whole library mounts here, and the search box and
 * filter panel ride along as `ListHeaderComponent` so the rows below stay virtualised.
 *
 * Layout only — the filtering itself is `lib/exerciseCatalog.ts` (pure, unit-tested) and every
 * read is a `@roamfit/store` repository call, per the "components render, screens decide, and
 * app/ writes no queries" convention this codebase already follows.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseCatalogRepo } from '@roamfit/store';
import type { Exercise } from '@roamfit/data';
import type { RootStackParamList } from '../navigation/types';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Exercises'>;

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

export default function ExercisesScreen({ navigation }: Props): React.JSX.Element {
  const { db, library } = useStore();
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

  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <TextInput
          testID="exercise-search"
          style={styles.search}
          value={filters.query}
          onChangeText={(query) => setFilters((prev) => ({ ...prev, query }))}
          placeholder="Search exercises"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search exercises"
        />
        <Pressable
          testID="toggle-filters"
          accessibilityRole="button"
          style={[styles.filterButton, appliedCount > 0 && styles.filterButtonActive]}
          onPress={() => setFiltersOpen((open) => !open)}
        >
          <Text
            style={[styles.filterButtonText, appliedCount > 0 && styles.filterButtonTextActive]}
          >
            Filters{appliedCount > 0 ? ` (${appliedCount})` : ''}
          </Text>
        </Pressable>
      </View>

      {filtersOpen && (
        <View testID="filter-panel" style={styles.filterPanel}>
          {/* The two dimensions that aren't properties of the exercise record — they're facts
              about this user's own state — sit first, as single-choice rows. "Needs video" is the
              one people come here for. */}
          <FilterRow
            testIdPrefix="filter-video"
            label="Demo video"
            options={VIDEO_OPTIONS}
            value={filters.video}
            onChange={(video) => setFilters((prev) => ({ ...prev, video }))}
          />
          <FilterRow
            testIdPrefix="filter-performed"
            label="Your history"
            options={PERFORMED_OPTIONS}
            value={filters.performed}
            onChange={(performed) => setFilters((prev) => ({ ...prev, performed }))}
          />

          {MULTI_SELECT_KEYS.map((key) => (
            <View key={key} style={styles.filterGroup}>
              <Text style={styles.filterGroupLabel}>{MULTI_SELECT_LABELS[key]}</Text>
              <View style={styles.chipWrap}>
                {options[key].map((value) => {
                  const selected = (filters[key] as string[]).includes(value);
                  return (
                    <Pressable
                      key={value}
                      testID={`filter-${key}-${value}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => toggleValue(key, value)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {formatToken(value)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {appliedCount > 0 && (
            <Pressable testID="clear-filters" accessibilityRole="button" onPress={clearAll}>
              <Text style={styles.clearLink}>Clear all filters</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text testID="exercise-count" style={styles.count}>
        {visible.length} of {library.exercises.length} exercises
      </Text>
    </View>
  );

  return (
    <FlatList
      testID="exercise-list"
      data={visible}
      keyExtractor={(exercise) => exercise.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      // The library is fixed-size and every row is the same height, so the default windowing is
      // more than enough; nothing here needs a measured-layout optimisation.
      ListEmptyComponent={
        <Text testID="exercise-empty" style={styles.empty}>
          Nothing matches that yet. Try fewer filters.
        </Text>
      }
      renderItem={({ item }) => (
        <ExerciseCard
          exercise={item}
          state={catalog[item.id] ?? fallback}
          onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
        />
      )}
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
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterGroupLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`${testIdPrefix}-${option.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ExerciseCard({
  exercise,
  state,
  onPress,
}: {
  exercise: Exercise;
  state: CatalogState;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      testID={`exercise-card-${exercise.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${primaryMuscleLabel(exercise)}, ${timesCompletedLabel(
        state.timesCompleted,
      )}`}
      style={styles.card}
      onPress={onPress}
    >
      <View style={styles.cardMain}>
        <Text style={styles.cardName}>{exercise.name}</Text>
        <Text style={styles.cardMuscle}>{primaryMuscleLabel(exercise)}</Text>
      </View>
      <View style={styles.cardMeta}>
        <Text
          testID={`exercise-card-count-${exercise.id}`}
          style={[styles.cardCount, state.timesCompleted === 0 && styles.cardCountNone]}
        >
          {timesCompletedLabel(state.timesCompleted)}
        </Text>
        {/* A quiet marker, not a warning: it is the operator's to-do list, and an exercise
            without a curated clip still teaches fine from its "How to" cue (ADR 0008). */}
        {!state.hasVideo && (
          <Text testID={`exercise-card-no-video-${exercise.id}`} style={styles.noVideoTag}>
            No video
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 10 },
  header: { gap: 12, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0f172a',
    minHeight: 44,
    backgroundColor: '#f8fafc',
  },
  filterButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  filterButtonActive: { backgroundColor: '#1d4ed8' },
  filterButtonText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  filterButtonTextActive: { color: '#ffffff' },
  filterPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  filterGroup: { gap: 6 },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#e2e8f0',
  },
  chipSelected: { backgroundColor: '#1d4ed8' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  chipTextSelected: { color: '#ffffff' },
  clearLink: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  count: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    minHeight: 64,
  },
  cardMain: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardMuscle: { fontSize: 13, color: '#475569' },
  cardMeta: { alignItems: 'flex-end', gap: 4 },
  cardCount: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  cardCountNone: { fontWeight: '600', color: '#94a3b8' },
  noVideoTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a16207',
    backgroundColor: '#fef9c3',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  empty: { fontSize: 14, color: '#64748b', paddingVertical: 24, textAlign: 'center' },
});
