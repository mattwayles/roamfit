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
import type { SwapAlternative } from '@roamfit/engine';
import { exerciseStateRepo, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import type { AnchorClass, Exercise, Pattern, ProgressionFamilyId } from '@roamfit/data';
import type { BandId } from '@roamfit/engine';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import AbandonSessionButton from '../components/AbandonSessionButton';
import BandChip from '../components/BandChip';
import SwapSheet from '../components/SwapSheet';

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
  /** ADR 0012 — one-line result of the last "too easy" tap. Informational only: never blocks,
   *  never nags, and is replaced rather than stacked (invariant 4). */
  /** §10.3 swap — which entry's picker is open, if any. */
  const [swapEntryId, setSwapEntryId] = useState<string | null>(null);
  const [swapExcludeAnchor, setSwapExcludeAnchor] = useState(false);
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

  /** Rest in 5s steps, floored at 0. Not derived from the effort table here — the store writes
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
   *  second at a time, and 5s matches the granularity the §5.4 effort table itself works in. */
  const handleAdjustDuration = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    if (entry.durationSec == null) return;
    const next = Math.max(5, entry.durationSec + delta);
    sessionsRepo.adjustDurationAtApproval(db, entry.id, next, nowUtcInstant());
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

  const updateDrag = (pageY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = pageY - d.startY;
    const count = bySection(d.section).length;
    const toIndex = Math.min(
      Math.max(d.fromIndex + Math.round(dy / CARD_PITCH), 0),
      Math.max(count - 1, 0),
    );
    const next = { ...d, dy, toIndex };
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
   *  follows the finger, and every card it has passed shifts one pitch the other way. */
  const dragDisplacement = (section: Section, index: number, entryId: string): number => {
    if (!drag || drag.section !== section) return 0;
    if (drag.entryId === entryId) return drag.dy;
    const { fromIndex, toIndex } = drag;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return -CARD_PITCH;
    if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return CARD_PITCH;
    return 0;
  };

  /**
   * §10.3 swap, before the session starts. The 3-5 candidates come from `@roamfit/engine`'s
   * `alternativesForSlot` — the same selection and ranking §10.6's mid-workout swap uses, so the
   * two surfaces cannot drift. This screen only supplies the current entry plus user state and
   * renders what comes back; it picks nothing itself (invariant 2).
   */
  const swapEntry = session.entries.find((e) => e.id === swapEntryId) ?? null;
  const swapAlternatives: SwapAlternative[] = swapEntry
    ? (() => {
        const clock = nowEngineClock();
        const profile = usersRepo.buildUserProfile(db, clock.today);
        return alternativesForSlot({
          library: library.exercises,
          entry: {
            exerciseId: swapEntry.exerciseId,
            role: 'main',
            band: swapEntry.band,
            sets: swapEntry.sets,
            repTarget: swapEntry.repTarget ?? undefined,
            durationSec: swapEntry.durationSec ?? undefined,
            restSec: swapEntry.restSec,
            tempoSec: swapEntry.tempoSec,
            notes: swapEntry.notes ?? undefined,
            effort: swapEntry.effort,
            progressionFamilyId: swapEntry.progressionFamilyId as ProgressionFamilyId | null,
            progressionLevelIdAtTime: swapEntry.progressionLevelIdAtTime,
            pattern: swapEntry.pattern as Pattern,
            anchorClass: swapEntry.anchorClass as AnchorClass,
            unilateral: swapEntry.unilateral,
            estimatedSec: swapEntry.estimatedSec,
          },
          anchorsAvailable: profile.anchorsAvailable,
          limitations: profile.limitations,
          today: clock.today,
          history: sessionsRepo.getHistoryForGeneration(db),
          exerciseStates: exerciseStateRepo.getAllExerciseStates(db),
          excludeAnchor: swapExcludeAnchor
            ? (library.exercises.find((e) => e.id === swapEntry.exerciseId)?.anchor ?? undefined)
            : undefined,
        });
      })()
    : [];

  const handleSwapSelect = (alt: SwapAlternative) => {
    if (!swapEntryId) return;
    sessionsRepo.recordSwapAtApproval(db, swapEntryId, alt.replacement, nowUtcInstant());
    setSwapEntryId(null);
    setSwapExcludeAnchor(false);
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

      {swapEntry != null ? (
        <SwapSheet
          alternatives={swapAlternatives}
          excludeAnchor={swapExcludeAnchor}
          onToggleExcludeAnchor={setSwapExcludeAnchor}
          onSelect={handleSwapSelect}
          onCancel={() => {
            setSwapEntryId(null);
            setSwapExcludeAnchor(false);
          }}
        />
      ) : null}

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
              onDragStart={(y) => beginDrag(section, entry.id, index, y)}
              onDragMove={updateDrag}
              onDragEnd={endDrag}
              onAdjustSets={(d) => handleAdjustSets(entry, d)}
              onAdjustRepTarget={(d) => handleAdjustRepTarget(entry, d)}
              onAdjustDuration={(d) => handleAdjustDuration(entry, d)}
              onAdjustRest={(d) => handleAdjustRest(entry, d)}
              onSwap={() => setSwapEntryId(entry.id)}
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
// Sized for a two-line exercise name: the title block is narrower now that the action icons
// share its row, so more names wrap. Feeds CARD_PITCH, which the drag gesture divides by.
const CARD_HEIGHT = 132;
const CARD_GAP = 8;
/** Exported so a test can express a drag in rows rather than hardcoding a pixel count. */
export const CARD_PITCH = CARD_HEIGHT + CARD_GAP;

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
  onDragStart,
  onDragMove,
  onDragEnd,
  onAdjustSets,
  onAdjustRepTarget,
  onAdjustDuration,
  onAdjustRest,
  onSwap,
  onRemove,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  /** The user's own band colours/labels (spec §1140), for `BandChip`. */
  bandTensions: Record<BandId, usersRepo.BandTension>;
  dragging: boolean;
  displacement: number;
  onDragStart: (pageY: number) => void;
  onDragMove: (pageY: number) => void;
  onDragEnd: () => void;
  onAdjustSets: (delta: number) => void;
  onAdjustRepTarget: (delta: number) => void;
  onAdjustDuration: (delta: number) => void;
  onAdjustRest: (delta: number) => void;
  onSwap: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const isTimed = entry.durationSec != null;
  // Rest 0 is a real prescription (warm-ups carry it), but "rest 0s" reads like a bug. Omit it,
  // and drop the whole line when there is nothing else on it either. The band is no longer part
  // of this string — it renders as a colour chip beside it (see `BandChip`).
  const restLabel = entry.restSec > 0 ? `rest ${entry.restSec}s` : null;
  const hasDetail = entry.band != null || restLabel != null;

  return (
    <View
      testID={`entry-${entry.exerciseId}`}
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
                <BandChip band={entry.band as BandId} tensions={bandTensions} />
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
    height: CARD_HEIGHT,
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
