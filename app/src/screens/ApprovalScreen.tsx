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
  alternativesForSlot,
  applyHardFilters,
  createRng,
  prescribeAccessory,
  prescribeWarmupCooldown,
  seedFromString,
} from '@roamfit/engine';
import { exerciseStateRepo, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import type { AnchorClass, Exercise, Pattern, ProgressionFamilyId, Role } from '@roamfit/data';
import type { BandId } from '@roamfit/engine';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import AbandonSessionButton from '../components/AbandonSessionButton';
import BandPicker from '../components/BandPicker';

type Props = NativeStackScreenProps<RootStackParamList, 'Approval'>;
type Section = 'warmup' | 'main' | 'cooldown';

/** `dy` is raw finger travel (what the dragged card follows); `toIndex` is that travel snapped
 *  to a row position (what every other card reacts to). */
interface DragState {
  section: Section;
  entryId: string;
  fromIndex: number;
  toIndex: number;
  startY: number;
  dy: number;
}

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

const SECTION_ROLE: Record<Section, Role> = {
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
  /** ADR 0012 — one-line result of the last "too easy" tap. Informational only: never blocks,
   *  never nags, and is replaced rather than stacked (invariant 4). */
  /** One-line result of the last swap. Informational, never blocking. */
  const [swapNotice, setSwapNotice] = useState<string | null>(null);
  /** §1140 — band colours are user data, so they are read from the user row rather than being a
   *  palette this screen invents. `ensureUser` always returns a complete set. */
  const bandTensions = usersRepo.ensureUser(db, nowUtcInstant()).bandTensions;
  /** The in-flight drag, or null. `dy` is raw finger travel (what the dragged card follows);
   *  `toIndex` is that travel snapped to a row position (what every other card reacts to). */
  const [drag, setDrag] = useState<DragState | null>(null);
  /** The authoritative drag, mirrored into state purely to trigger re-renders. Responder events
   *  arrive faster than React commits, and the commit at drag end must not live inside a
   *  `setState` updater — updaters have to be pure, and React may run one twice, which would
   *  apply the reorder twice. */
  const dragRef = React.useRef<DragState | null>(null);
  /** Card heights as actually laid out, keyed by entry id. A ref rather than state: this is read
   *  by the drag maths and must never itself trigger a render, or every measurement would cause
   *  one. */
  const cardHeightsRef = React.useRef<Map<string, number>>(new Map());

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

  /** Rest in 5s steps, floored at 0. Not derived from the difficulty table here — the store writes
   *  it and the engine recomputes `estimatedSec`, so the header estimate follows. */
  const handleAdjustRest = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    const next = Math.max(0, entry.restSec + delta);
    sessionsRepo.adjustRestAtApproval(db, entry.id, next, nowUtcInstant());
    reload();
  };

  const handleAdjustRepTarget = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    if (entry.repTarget == null) return;
    const next = Math.max(1, entry.repTarget + delta);
    sessionsRepo.adjustRepTargetAtApproval(db, entry.id, next, nowUtcInstant());
    reload();
  };

  /** The timed counterpart. Steps in 5s rather than 1s — a hold is not meaningfully edited a
   *  second at a time, and 5s matches the granularity the §5.4 difficulty table itself works in. */
  const handleAdjustDuration = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    if (entry.durationSec == null) return;
    const next = Math.max(5, entry.durationSec + delta);
    sessionsRepo.adjustDurationAtApproval(db, entry.id, next, nowUtcInstant());
    reload();
  };

  /** §10.3 — which band this exercise is meant to be done with. The engine prescribes one from
   *  progression state; only the user knows which bands are actually in the bag today. */
  const handleChangeBand = (entry: sessionsRepo.SessionEntryRecord, band: BandId) => {
    sessionsRepo.adjustBandAtApproval(db, entry.id, band, nowUtcInstant());
    reload();
  };

  /**
   * §10.3 re-order, by dragging. This is a phone: the previous ▲/▼ buttons cost two more controls
   * on an already-overcrowded row to express something a drag says directly.
   *
   * Hand-rolled on core `PanResponder` rather than pulling in a draggable-list library, which
   * would mean adding `react-native-reanimated` + `react-native-gesture-handler` — two native
   * dependencies, and therefore an Expo dev-client rebuild before the app would launch at all.
   * The interaction here is narrow enough not to justify that: a vertical drag, within one
   * section, over fixed-height cards, so the target index is just travel distance / row pitch.
   *
   * Section-scoped for the same reason the buttons were (see `reorderEntriesAtApproval`): warm-ups
   * never move past main work. `scrollEnabled` is switched off for the duration so the ScrollView
   * doesn't fight the gesture.
   */
  const beginDrag = (section: Section, entryId: string, index: number, pageY: number) => {
    const next = { section, entryId, fromIndex: index, toIndex: index, startY: pageY, dy: 0 };
    dragRef.current = next;
    setDrag(next);
  };

  /** Measured height of one card, or the estimate until `onLayout` has reported it. */
  const heightOf = (entryId: string): number =>
    cardHeightsRef.current.get(entryId) ?? ESTIMATED_CARD_HEIGHT;

  /**
   * Which row the finger has travelled onto, walking real card heights rather than dividing by a
   * constant — cards are different heights now, so a single pitch would drift further out with
   * every card passed.
   *
   * A card is passed once the finger has travelled beyond its midpoint, which is what makes the
   * swap feel like it happens when the two cards visually cross.
   */
  const targetIndexFor = (d: DragState, dy: number): number => {
    const list = bySection(d.section);
    if (list.length === 0) return 0;
    let index = d.fromIndex;
    let travelled = 0;
    if (dy > 0) {
      for (let i = d.fromIndex + 1; i < list.length; i++) {
        const step = heightOf(list[i].id) + CARD_GAP;
        if (dy < travelled + step / 2) break;
        travelled += step;
        index = i;
      }
    } else if (dy < 0) {
      for (let i = d.fromIndex - 1; i >= 0; i--) {
        const step = heightOf(list[i].id) + CARD_GAP;
        if (-dy < travelled + step / 2) break;
        travelled += step;
        index = i;
      }
    }
    return index;
  };

  const updateDrag = (pageY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = pageY - d.startY;
    const next = { ...d, dy, toIndex: targetIndexFor(d, dy) };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || d.toIndex === d.fromIndex) return;
    const list = bySection(d.section);
    const reordered = [...list];
    const [moved] = reordered.splice(d.fromIndex, 1);
    reordered.splice(d.toIndex, 0, moved);
    sessionsRepo.reorderEntriesAtApproval(
      db,
      sessionId,
      d.section,
      reordered.map((e) => e.id),
      nowUtcInstant(),
    );
    reload();
  };

  /** How far a card should slide to show where the dragged one will land: the dragged card
   *  follows the finger, and every card it has passed shifts out of the way by exactly the space
   *  the dragged card occupies — its own measured height, not a shared constant. */
  const dragDisplacement = (section: Section, index: number, entryId: string): number => {
    if (!drag || drag.section !== section) return 0;
    if (drag.entryId === entryId) return drag.dy;
    const { fromIndex, toIndex } = drag;
    const gap = heightOf(drag.entryId) + CARD_GAP;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return -gap;
    if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return gap;
    return 0;
  };

  /**
   * §10.3 swap, in one tap, before the session starts.
   *
   * The picker sheet this replaced asked the user to choose between alternatives the engine had
   * *already ranked* — second-guessing a decision they had no more information about than it did.
   * Taking the top-ranked candidate is the same answer without the detour, and tapping again
   * simply swaps again, which is the cheap way to reject a suggestion.
   *
   * The candidates come from `@roamfit/engine`'s `alternativesForSlot` — the same selection and
   * ranking §10.6's mid-workout swap uses, so the two surfaces cannot drift (invariant 2).
   */
  const handleSwap = (entry: sessionsRepo.SessionEntryRecord) => {
    const clock = nowEngineClock();
    const profile = usersRepo.buildUserProfile(db, clock.today);
    const [best] = alternativesForSlot({
      library: library.exercises,
      entry: {
        exerciseId: entry.exerciseId,
        role: 'main',
        band: entry.band,
        sets: entry.sets,
        repTarget: entry.repTarget ?? undefined,
        durationSec: entry.durationSec ?? undefined,
        restSec: entry.restSec,
        tempoSec: entry.tempoSec,
        notes: entry.notes ?? undefined,
        difficulty: entry.difficulty,
        progressionFamilyId: entry.progressionFamilyId as ProgressionFamilyId | null,
        progressionLevelIdAtTime: entry.progressionLevelIdAtTime,
        pattern: entry.pattern as Pattern,
        anchorClass: entry.anchorClass as AnchorClass,
        unilateral: entry.unilateral,
        estimatedSec: entry.estimatedSec,
      },
      anchorsAvailable: profile.anchorsAvailable,
      limitations: profile.limitations,
      disabledExerciseIds: profile.disabledExerciseIds,
      today: clock.today,
      history: sessionsRepo.getHistoryForGeneration(db),
      exerciseStates: exerciseStateRepo.getAllExerciseStates(db),
      maxResults: 1,
    });
    if (!best) {
      setSwapNotice('No alternative fits that slot right now.');
      return;
    }
    sessionsRepo.recordSwapAtApproval(db, entry.id, best.replacement, nowUtcInstant());
    setSwapNotice(`Swapped to ${best.exercise.name}.`);
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
      disabledExerciseIds: new Set(profile.disabledExerciseIds),
      today: clock.today,
    });
    return hardFiltered.filter(
      (e) => e.roles.includes(SECTION_ROLE[section]) && !alreadyInSession.has(e.id),
    );
  };

  const handleAddExercise = (section: Section, exercise: Exercise) => {
    const prescription =
      section === 'main'
        ? prescribeAccessory({
            exercise,
            requestedDifficulty: session.difficulty,
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
          difficulty: session.difficulty,
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

  /** §10.10 abandon — the session is still `planned` here (nothing has run yet), so there is no
   *  in-progress exercise/set to attribute the §8.3 "abandoned" signal to; `discardSession` is
   *  called with no entry context, same as every other call site, never a parallel path. Returns
   *  to Home rather than bouncing the user straight back into the generator (invariant 4 —
   *  never punish, never nag). */
  const handleAbandon = () => {
    sessionsRepo.discardSession(db, sessionId, {}, nowUtcInstant());
    navigation.navigate('Home');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={drag === null}>
      <Text style={styles.explanation}>{session.explanation}</Text>
      <Text style={styles.estimate}>~{estimateMinutes(session)} min estimated</Text>
      {swapNotice != null && (
        <Text testID="swap-notice" style={styles.swapNotice}>
          {swapNotice}
        </Text>
      )}

      {(['warmup', 'main', 'cooldown'] as const).map((section) => (
        <View key={section} style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>{section}</Text>
          {bySection(section).map((entry, index) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              exerciseName={
                library.exercises.find((e) => e.id === entry.exerciseId)?.name ?? entry.exerciseId
              }
              bandTensions={bandTensions}
              dragging={drag?.section === section && drag.entryId === entry.id}
              displacement={dragDisplacement(section, index, entry.id)}
              onMeasure={(height) => cardHeightsRef.current.set(entry.id, height)}
              onDragStart={(y) => beginDrag(section, entry.id, index, y)}
              onDragMove={updateDrag}
              onDragEnd={endDrag}
              onAdjustSets={(d) => handleAdjustSets(entry, d)}
              onAdjustRepTarget={(d) => handleAdjustRepTarget(entry, d)}
              onAdjustDuration={(d) => handleAdjustDuration(entry, d)}
              onAdjustRest={(d) => handleAdjustRest(entry, d)}
              onChangeBand={(band) => handleChangeBand(entry, band)}
              onSwap={() => handleSwap(entry)}
              onRemove={() => handleRemove(entry)}
            />
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

      <AbandonSessionButton onConfirm={handleAbandon} />
    </ScrollView>
  );
}

/** Fixed so a drag can compute a target index from travel distance without measuring every row.
 *  The card's own content is laid out to fit exactly this height. */
const CARD_GAP = 8;

/**
 * Only a fallback. Cards size themselves to their content — a three-line exercise name gets a
 * taller card than a one-line one, which is the correct outcome and what the fixed height this
 * replaced could not do without clipping.
 *
 * The drag gesture needs to know how tall each card actually is to work out which row a finger
 * has travelled onto, so every card reports its height via `onLayout`. This value stands in for
 * the frame or two before that first measurement arrives, and for a test environment that never
 * lays anything out at all.
 */
export const ESTIMATED_CARD_HEIGHT = 132;

/** One editable exercise in the plan.
 *
 * Replaces a single cramped horizontal row that packed a reorder column, the name, the detail
 * line and up to six buttons across one line — the name was squeezed to a couple of characters
 * and every button label was clipped ("reps−" rendered as "reps", "too easy ▲" as "too e").
 * Controls now sit on their own lines below the name, each stepper labelled with what it changes
 * and showing its current value, so nothing depends on a label that might not fit.
 */
function EntryCard({
  entry,
  exerciseName,
  bandTensions,
  dragging,
  displacement,
  onMeasure,
  onDragStart,
  onDragMove,
  onDragEnd,
  onAdjustSets,
  onAdjustRepTarget,
  onAdjustDuration,
  onAdjustRest,
  onChangeBand,
  onSwap,
  onRemove,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  /** The user's own band colours/labels (spec §1140), for `BandChip`. */
  bandTensions: Record<BandId, usersRepo.BandTension>;
  dragging: boolean;
  displacement: number;
  /** Reports this card's laid-out height so the drag gesture can work in real distances. */
  onMeasure: (height: number) => void;
  onDragStart: (pageY: number) => void;
  onDragMove: (pageY: number) => void;
  onDragEnd: () => void;
  onAdjustSets: (delta: number) => void;
  onAdjustRepTarget: (delta: number) => void;
  onAdjustDuration: (delta: number) => void;
  onAdjustRest: (delta: number) => void;
  onChangeBand: (band: BandId) => void;
  onSwap: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const isTimed = entry.durationSec != null;
  // Rest 0 is a real prescription (warm-ups carry it), but "rest 0s" reads like a bug. Omit it,
  // and drop the whole line when there is nothing else on it either. The band is no longer part
  // of this string — it renders as a colour chip beside it, which is also the control for
  // changing which band this exercise is meant to be done with (see `BandPicker`).
  const restLabel = entry.restSec > 0 ? `rest ${entry.restSec}s` : null;
  const hasDetail = entry.band != null || restLabel != null;

  return (
    <View
      testID={`entry-${entry.exerciseId}`}
      onLayout={(e) => onMeasure(e.nativeEvent.layout.height)}
      style={[
        styles.card,
        dragging && styles.cardDragging,
        displacement !== 0 && { transform: [{ translateY: displacement }] },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          testID={`drag-handle-${entry.exerciseId}`}
          accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${exerciseName}`}
          style={styles.dragHandle}
          // The raw responder props rather than `PanResponder`: all this gesture needs is
          // `pageY`, and PanResponder would add a gestureState layer we do not use plus its own
          // touch-history bookkeeping, which makes the handle far harder to drive from a test.
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => onDragStart(e.nativeEvent.pageY)}
          onResponderMove={(e) => onDragMove(e.nativeEvent.pageY)}
          onResponderRelease={onDragEnd}
          onResponderTerminate={onDragEnd}
        >
          <Text style={styles.dragHandleText}>⠿</Text>
        </View>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.entryName} numberOfLines={2}>
            {exerciseName}
          </Text>
          {hasDetail && (
            <View style={styles.entryDetailRow}>
              {entry.band != null && (
                <BandPicker
                  band={entry.band as BandId}
                  tensions={bandTensions}
                  onChange={onChangeBand}
                  testID={`band-${entry.exerciseId}`}
                  accessibilityLabel={`Band for ${exerciseName}`}
                />
              )}
              {restLabel != null && <Text style={styles.entryDetail}>{restLabel}</Text>}
            </View>
          )}
        </View>

        {/* Both actions are icons on the title's own row, so they cost no vertical space at all.
            The accessible names carry the meaning the glyphs cannot. */}
        <View style={styles.cardActions}>
          <Pressable
            testID={`swap-${entry.exerciseId}`}
            accessibilityRole="button"
            accessibilityLabel={`Swap ${exerciseName} for another exercise`}
            style={[styles.iconButton, styles.swapButton]}
            onPress={onSwap}
          >
            <Text style={styles.swapButtonText}>⇄</Text>
          </Pressable>
          <Pressable
            testID={`remove-${entry.exerciseId}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${exerciseName}`}
            style={[styles.iconButton, styles.removeButton]}
            onPress={onRemove}
          >
            <Text style={styles.removeButtonText}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepperRow}>
        <Stepper
          label="Sets"
          value={String(entry.sets)}
          minusTestID={`sets-minus-${entry.exerciseId}`}
          plusTestID={`sets-plus-${entry.exerciseId}`}
          onMinus={() => onAdjustSets(-1)}
          onPlus={() => onAdjustSets(1)}
        />
        {isTimed ? (
          <Stepper
            label="Time"
            value={`${entry.durationSec}s`}
            minusTestID={`duration-minus-${entry.exerciseId}`}
            plusTestID={`duration-plus-${entry.exerciseId}`}
            onMinus={() => onAdjustDuration(-5)}
            onPlus={() => onAdjustDuration(5)}
          />
        ) : entry.repTarget != null ? (
          <Stepper
            label="Reps"
            value={String(entry.repTarget)}
            minusTestID={`reps-minus-${entry.exerciseId}`}
            plusTestID={`reps-plus-${entry.exerciseId}`}
            onMinus={() => onAdjustRepTarget(-1)}
            onPlus={() => onAdjustRepTarget(1)}
          />
        ) : (
          <View style={styles.stepper} />
        )}
        <Stepper
          label="Rest"
          value={`${entry.restSec}s`}
          minusTestID={`rest-minus-${entry.exerciseId}`}
          plusTestID={`rest-plus-${entry.exerciseId}`}
          onMinus={() => onAdjustRest(-5)}
          onPlus={() => onAdjustRest(5)}
        />
      </View>
    </View>
  );
}

/** A labelled −/value/+ group. The old buttons carried the label *inside* them ("reps−"), which
 *  clipped; the label now sits above and the buttons carry only the glyph, which always fits. */
function Stepper({
  label,
  value,
  minusTestID,
  plusTestID,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  minusTestID: string;
  plusTestID: string;
  onMinus: () => void;
  onPlus: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          testID={minusTestID}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          style={styles.stepperButton}
          onPress={onMinus}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          testID={plusTestID}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          style={styles.stepperButton}
          onPress={onPlus}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // No fixed height: a long exercise name gets a taller card, which is correct. `minHeight`
    // only stops a card with nothing in its detail line from looking collapsed.
    minHeight: ESTIMATED_CARD_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  cardDragging: {
    backgroundColor: '#fff',
    borderColor: '#94a3b8',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dragHandle: {
    width: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  dragHandleText: { fontSize: 20, color: '#94a3b8' },
  cardTitleBlock: { flex: 1, paddingTop: 2 },
  entryName: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  swapNotice: { fontSize: 13, color: '#1d4ed8' },
  entryDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  entryDetail: { fontSize: 12, color: '#64748b' },
  stepperRow: { flexDirection: 'row', gap: 16 },
  stepper: { flex: 1 },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: {
    width: 32,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 20, fontWeight: '700', color: '#334155', lineHeight: 24 },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  // In the header row, not on a line of their own: an icon pair is far narrower than the row it
  // used to occupy, and giving it a whole line cost ~26pt of every card for no information.
  // Pinned to the top so they stay level with the first line of a name that wraps.
  cardActions: { flexDirection: 'row', gap: 8, marginLeft: 8, alignSelf: 'flex-start' },
  iconButton: {
    width: 44,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Blue, not the steppers' slate — it was previously the exact same '#e2e8f0' as the +/-
  // buttons, so the one control that replaces the exercise looked like one that nudges a number.
  // Reuses the accent the progression board's level-up already uses rather than inventing a
  // fourth hue: on this card it is unique, and app-wide it stays consistent.
  swapButton: { backgroundColor: '#dbeafe' },
  swapButtonText: { fontSize: 17, fontWeight: '700', color: '#1d4ed8', lineHeight: 21 },
  removeButton: { backgroundColor: '#fee2e2' },
  removeButtonText: { fontSize: 16, fontWeight: '700', color: '#b91c1c', lineHeight: 20 },

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
