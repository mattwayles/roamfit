/**
 * §10.3 Plan Approval. The §5.8 explanation line at top, sets/reps/band/rest per entry,
 * remove/add-at-approval and adjust-sets/adjust-rep-target-at-approval (all real store
 * mutations — nothing computed here except the live time estimate, which is a pure sum over
 * `session.entries` and so updates for free on every `reload()`), Regenerate, and START (which
 * transitions the already-created pending session to 'active' via `startSession`).
 *
 * §10.3 "Add exercise": candidates come from `@roamfit/engine`'s `applyHardFilters` — the exact
 * same §13.1/§13.2/§5.3 filters generation itself uses — plus the engine's own
 * `prescribeAccessory`/`prescribeWarmupCooldown` for the actual sets/reps/band. This screen never
 * invents a prescription; it only lists what the engine says is eligible and persists what the
 * engine prescribes.
 *
 * Not implemented in this pass: "Regenerate with a note" needs the online LLM-intake path (§7.1),
 * out of scope for the offline-first loop this wave proves out.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  applyHardFilters,
  createRng,
  prescribeAccessory,
  prescribeWarmupCooldown,
  seedFromString,
} from '@roamfit/engine';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import type { Exercise } from '@roamfit/data';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

type Props = NativeStackScreenProps<RootStackParamList, 'Approval'>;
type Section = 'warmup' | 'main' | 'cooldown';

/**
 * §5.6 — `estimatedSec` is ALREADY the complete per-entry cost: `formulas.ts`'s
 * `repExerciseSec`/`timedExerciseSec` both return `sets × (work + rest) + setup`. The engine's own
 * time-fit stage (`timefit/fitSession.ts`) sums exactly this field against the target budget, so
 * summing it here is what makes the approval screen agree with the session the engine actually
 * built.
 *
 * This previously read `sets * (estimatedSec + restSec)`, which multiplied an already-complete
 * total by the set count again and re-added rest — inflating a real 30-minute session to ~86-105
 * displayed minutes (2.8x). The engine was never wrong; only this label was.
 */
export function estimateMinutes(session: SessionRecord): number {
  const activeEntries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const totalSec = activeEntries.reduce((sum, e) => sum + e.estimatedSec, 0);
  return Math.round(totalSec / 60);
}

const SECTION_ROLE: Record<Section, Exercise['role']> = {
  warmup: 'warmup',
  main: 'main',
  cooldown: 'cooldown',
};

export default function ApprovalScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // §10.3 "add exercise" — which section's picker is open, if any. Closed by default.
  const [addingSection, setAddingSection] = useState<Section | null>(null);

  const reload = useCallback(() => {
    setSession(sessionsRepo.getSession(db, sessionId));
  }, [db, sessionId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const bySection = (section: 'warmup' | 'main' | 'cooldown') =>
    session.entries.filter((e) => e.section === section && e.entryStatus !== 'removed_at_approval');

  const handleRemove = (entry: sessionsRepo.SessionEntryRecord) => {
    sessionsRepo.removeEntryAtApproval(db, entry.id, nowUtcInstant());
    reload();
  };

  const handleAdjustSets = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    const next = Math.max(1, entry.sets + delta);
    sessionsRepo.adjustSetsAtApproval(db, entry.id, next, nowUtcInstant());
    reload();
  };

  const handleAdjustRepTarget = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    if (entry.repTarget == null) return;
    const next = Math.max(1, entry.repTarget + delta);
    sessionsRepo.adjustRepTargetAtApproval(db, entry.id, next, nowUtcInstant());
    reload();
  };

  /** §10.3 re-order — section-scoped (warm-ups never move past main work; see
   *  `reorderEntriesAtApproval`'s own doc comment). `direction` swaps the entry with its
   *  immediate neighbor *within this section's currently-displayed list* — a no-op at either
   *  boundary. Persisted via the store, never computed/invented here (ADR 0003 / issue #13); the
   *  Workout screen picks up the new order for free the next time it reads `session.entries`
   *  (already sorted by `orderIndex`), no separate wiring needed there. */
  const handleMoveEntry = (
    section: Section,
    entry: sessionsRepo.SessionEntryRecord,
    direction: -1 | 1,
  ) => {
    const list = bySection(section);
    const index = list.findIndex((e) => e.id === entry.id);
    const swapIndex = index + direction;
    if (index === -1 || swapIndex < 0 || swapIndex >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    sessionsRepo.reorderEntriesAtApproval(
      db,
      sessionId,
      section,
      reordered.map((e) => e.id),
      nowUtcInstant(),
    );
    reload();
  };

  /** §10.3 "add exercise" candidates — the same hard filters (§13.1/§13.2/§5.3) generation
   *  itself runs, via the engine's own `applyHardFilters`, never reimplemented here. Excludes
   *  exercises already active in this session (adding a duplicate isn't a meaningful edit). */
  const candidatesFor = (section: Section): Exercise[] => {
    const clock = nowEngineClock();
    const profile = usersRepo.buildUserProfile(db, clock.today);
    const alreadyInSession = new Set(
      session.entries
        .filter((e) => e.entryStatus !== 'removed_at_approval')
        .map((e) => e.exerciseId),
    );
    const hardFiltered = applyHardFilters({
      library: library.exercises,
      request: {},
      anchorsAvailable: profile.anchorsAvailable,
      limitations: profile.limitations,
      today: clock.today,
    });
    return hardFiltered.filter(
      (e) => e.role === SECTION_ROLE[section] && !alreadyInSession.has(e.id),
    );
  };

  const handleAddExercise = (section: Section, exercise: Exercise) => {
    const prescription =
      section === 'main'
        ? prescribeAccessory({
            exercise,
            requestedEffort: session.effort,
            recoveryTreatment: false,
          })
        : prescribeWarmupCooldown(exercise, section);
    sessionsRepo.addEntryAtApproval(db, sessionId, section, prescription, nowUtcInstant());
    setAddingSection(null);
    reload();
  };

  const handleRegenerate = () => {
    setRegenerating(true);
    try {
      sessionsRepo.recordRegenerateTap(db, sessionId, nowUtcInstant());
      const clock = nowEngineClock();
      const utcInstant = nowUtcInstant();
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: {
          focus: session.focus,
          effort: session.effort,
          targetMinutes: session.targetMinutes,
        },
        clock,
        rng: createRng(seedFromString(utcInstant)),
        utcInstant,
      });
      // §10.10 — only one pending session; discard the old plan before creating the new one.
      sessionsRepo.discardSession(db, sessionId, {}, utcInstant);
      const newSessionId = sessionsRepo.createPendingSession(db, {
        plan,
        utcInstant,
        localDate: clock.today,
        tzId: clock.tzId,
        comebackTier,
        recoveryWeekManual,
      });
      navigation.replace('Approval', { sessionId: newSessionId });
    } finally {
      setRegenerating(false);
    }
  };

  const handleStart = () => {
    sessionsRepo.startSession(db, sessionId, nowUtcInstant());
    navigation.replace('Workout', { sessionId });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.explanation}>{session.explanation}</Text>
      <Text style={styles.estimate}>~{estimateMinutes(session)} min estimated</Text>

      {(['warmup', 'main', 'cooldown'] as const).map((section) => (
        <View key={section} style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>{section}</Text>
          {bySection(section).map((entry, index, list) => (
            <View key={entry.id} style={styles.entryRow} testID={`entry-${entry.exerciseId}`}>
              <View style={styles.reorderColumn}>
                <Pressable
                  testID={`move-up-${entry.exerciseId}`}
                  style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                  disabled={index === 0}
                  onPress={() => handleMoveEntry(section, entry, -1)}
                >
                  <Text style={styles.reorderButtonText}>▲</Text>
                </Pressable>
                <Pressable
                  testID={`move-down-${entry.exerciseId}`}
                  style={[
                    styles.reorderButton,
                    index === list.length - 1 && styles.reorderButtonDisabled,
                  ]}
                  disabled={index === list.length - 1}
                  onPress={() => handleMoveEntry(section, entry, 1)}
                >
                  <Text style={styles.reorderButtonText}>▼</Text>
                </Pressable>
              </View>
              <View style={styles.entryInfo}>
                <Text style={styles.entryName}>
                  {library.exercises.find((e) => e.id === entry.exerciseId)?.name ??
                    entry.exerciseId}
                </Text>
                <Text style={styles.entryDetail}>
                  {entry.sets} × {entry.repTarget ?? `${entry.durationSec}s`}
                  {entry.band ? ` · ${entry.band}` : ''} · rest {entry.restSec}s
                </Text>
              </View>
              <View style={styles.entryActions}>
                {entry.repTarget != null && (
                  <>
                    <Pressable
                      testID={`reps-minus-${entry.exerciseId}`}
                      style={styles.smallButton}
                      onPress={() => handleAdjustRepTarget(entry, -1)}
                    >
                      <Text style={styles.smallButtonText}>reps−</Text>
                    </Pressable>
                    <Pressable
                      testID={`reps-plus-${entry.exerciseId}`}
                      style={styles.smallButton}
                      onPress={() => handleAdjustRepTarget(entry, 1)}
                    >
                      <Text style={styles.smallButtonText}>reps+</Text>
                    </Pressable>
                  </>
                )}
                <Pressable
                  testID={`sets-minus-${entry.exerciseId}`}
                  style={styles.smallButton}
                  onPress={() => handleAdjustSets(entry, -1)}
                >
                  <Text style={styles.smallButtonText}>−</Text>
                </Pressable>
                <Pressable
                  testID={`sets-plus-${entry.exerciseId}`}
                  style={styles.smallButton}
                  onPress={() => handleAdjustSets(entry, 1)}
                >
                  <Text style={styles.smallButtonText}>+</Text>
                </Pressable>
                <Pressable
                  testID={`remove-${entry.exerciseId}`}
                  style={[styles.smallButton, styles.removeButton]}
                  onPress={() => handleRemove(entry)}
                >
                  <Text style={styles.smallButtonText}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {addingSection === section ? (
            <View style={styles.addPicker} testID={`add-picker-${section}`}>
              {candidatesFor(section)
                .slice(0, 20)
                .map((exercise) => (
                  <Pressable
                    key={exercise.id}
                    testID={`add-option-${exercise.id}`}
                    style={styles.addOption}
                    onPress={() => handleAddExercise(section, exercise)}
                  >
                    <Text style={styles.addOptionText}>{exercise.name}</Text>
                  </Pressable>
                ))}
              <Pressable
                testID={`add-cancel-${section}`}
                style={styles.addCancel}
                onPress={() => setAddingSection(null)}
              >
                <Text style={styles.addCancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID={`add-exercise-${section}`}
              style={styles.addExerciseButton}
              onPress={() => setAddingSection(section)}
            >
              <Text style={styles.addExerciseButtonText}>+ Add exercise</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Pressable
        testID="regenerate-button"
        style={styles.regenerateButton}
        onPress={handleRegenerate}
        disabled={regenerating}
      >
        <Text style={styles.regenerateButtonText}>Regenerate</Text>
      </Pressable>

      <Pressable testID="start-button" style={styles.startButton} onPress={handleStart}>
        <Text style={styles.startButtonText}>START</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16 },
  explanation: { fontSize: 15, color: '#334155', lineHeight: 20 },
  estimate: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  sectionBlock: { gap: 8 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
  },
  reorderColumn: { gap: 2 },
  reorderButton: {
    width: 28,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: { opacity: 0.3 },
  reorderButtonText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  entryInfo: { flex: 1, gap: 2 },
  entryName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  entryDetail: { fontSize: 13, color: '#64748b' },
  entryActions: { flexDirection: 'row', gap: 6 },
  smallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: { backgroundColor: '#fecaca' },
  addExerciseButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
  },
  addExerciseButtonText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  addPicker: {
    gap: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  addOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  addOptionText: { fontSize: 14, color: '#0f172a' },
  addCancel: { alignItems: 'center', paddingVertical: 6 },
  addCancelText: { color: '#64748b', fontWeight: '600' },
  smallButtonText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  regenerateButton: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 48,
    justifyContent: 'center',
  },
  regenerateButtonText: { fontWeight: '600', color: '#334155' },
  startButton: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
  },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
