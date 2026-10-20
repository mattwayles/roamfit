/**
 * Track 37f — training preferences. The defaults must reproduce the engine exactly (every other
 * suite, the goldens included, runs with no preferences and is the proof of that); each non-default
 * must move its lever and nothing else.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from './pipeline';
import { createRng } from './rng';
import { baseStartLevel, findFamily } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { applySessionResult } from './progression/rules';
import { applyAccessorySessionResult } from './progression/accessory';
import { FIXED_POINT_ANCHORS } from './filters/hardFilters';
import { recencyTier } from './selection/candidates';
import {
  DEFAULT_TRAINING_PREFERENCES,
  applyTrainingToMainEntry,
  cooldownMinutesFor,
  cooldownWindowsFor,
  recoveryWindowDaysFor,
  resolveTrainingPreferences,
  sessionsPerStepFor,
  warmupMinutesFor,
} from './preferences';
import type { TrainingPreferences } from './preferences';
import { cooldownMinutes, warmupMinutes } from './timefit/formulas';
import { estimateEntrySec } from './prescription/prescribe';
import type { ProgressionState, SessionEntry, UserState } from './types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-10-18';
const byId = new Map(library.map((e) => [e.id, e]));

function userState(training?: Partial<TrainingPreferences>): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = baseStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
    progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return {
    profile: {
      units: 'lb',
      limitations: [],
      anchorsAvailable: [...FIXED_POINT_ANCHORS],
      disabledExerciseIds: [],
      training,
    },
    exerciseStates: {},
    progressionStates,
    history: [],
    hasEverCompletedSession: false,
  };
}

function plan(training?: Partial<TrainingPreferences>, focus: 'upper' | 'legs' = 'upper') {
  return generateSession({
    library: exerciseLibrary,
    families: familyLibrary,
    userState: userState(training),
    request: { focus, difficulty: 'medium', targetMinutes: 45 },
    clock: { today: TODAY, tzId: 'UTC' },
    rng: createRng(5),
  });
}

function mainEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  const base: SessionEntry = {
    exerciseId: 'bw-push-up',
    role: 'main',
    band: null,
    sets: 3,
    repTarget: 10,
    restSec: 60,
    tempoSec: 3,
    difficulty: 'medium',
    progressionFamilyId: 'horizontal_push',
    progressionLevelIdAtTime: 'horizontal_push.l4',
    pattern: 'horizontal_push',
    anchorClass: 'none',
    unilateral: false,
    estimatedSec: 0,
    ...overrides,
  };
  return { ...base, estimatedSec: estimateEntrySec(base) };
}

describe('defaults', () => {
  it('fill missing fields, and the default plan equals the no-preferences plan', () => {
    expect(resolveTrainingPreferences(undefined)).toEqual(DEFAULT_TRAINING_PREFERENCES);
    expect(resolveTrainingPreferences({ goal: 'strength' })).toEqual({
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'strength',
    });
    expect(plan({ ...DEFAULT_TRAINING_PREFERENCES })).toEqual(plan(undefined));
  });

  it('default windows, recovery, pace and warm-up are the pre-37f constants', () => {
    expect(cooldownWindowsFor('balanced')).toEqual({ hard: 2, soft: 5 });
    expect(recoveryWindowDaysFor('standard')).toBe(2);
    expect(sessionsPerStepFor('steady')).toBe(1);
    for (const t of [15, 30, 45, 60, 90, 120]) {
      expect(warmupMinutesFor(t, 'standard')).toBe(warmupMinutes(t));
      expect(cooldownMinutesFor(t, 'standard')).toBe(cooldownMinutes(t));
    }
  });
});

describe('goal at prescription', () => {
  const pushUp = byId.get('bw-push-up')!;
  const plank = byId.get('bw-plank')!;

  it('strength: 3 fewer reps and 1.5x rest; endurance: 7 more reps and shorter rest', () => {
    const strength = applyTrainingToMainEntry(mainEntry(), pushUp, {
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'strength',
    });
    expect(strength).toMatchObject({ repTarget: 7, restSec: 90, sets: 3 });
    const endurance = applyTrainingToMainEntry(mainEntry(), pushUp, {
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'endurance',
    });
    expect(endurance).toMatchObject({ repTarget: 17, restSec: 40, sets: 3 });
  });

  it('muscle: one more set; the estimate follows every change', () => {
    const muscle = applyTrainingToMainEntry(mainEntry(), pushUp, {
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'muscle',
    });
    expect(muscle.sets).toBe(4);
    expect(muscle.estimatedSec).toBe(estimateEntrySec(muscle));
    expect(muscle.estimatedSec).toBeGreaterThan(mainEntry().estimatedSec);
  });

  it('holds move by seconds, and floors keep every set real', () => {
    const hold = mainEntry({ repTarget: undefined, durationSec: 20, exerciseId: 'bw-plank' });
    const strength = applyTrainingToMainEntry(hold, plank, {
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'strength',
      rest: 'shorter',
    });
    expect(strength.durationSec).toBe(15);
    const tiny = applyTrainingToMainEntry(mainEntry({ repTarget: 4, restSec: 15 }), pushUp, {
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'strength',
      rest: 'shorter',
    });
    expect(tiny.repTarget).toBe(3);
    expect(tiny.restSec).toBeGreaterThanOrEqual(15);
  });

  it('leaves warm-ups, cool-downs and cardio alone', () => {
    const prefs = {
      ...DEFAULT_TRAINING_PREFERENCES,
      goal: 'endurance' as const,
      rest: 'longer' as const,
    };
    const warmup = mainEntry({ role: 'warmup' });
    expect(applyTrainingToMainEntry(warmup, pushUp, prefs)).toBe(warmup);
    const cardio = mainEntry({ exerciseId: 'bw-jumping-jack', pattern: 'conditioning' });
    expect(applyTrainingToMainEntry(cardio, byId.get('bw-jumping-jack')!, prefs)).toBe(cardio);
  });

  it('a strength session prescribes 5-9 reps on every rep-based main entry', () => {
    const general = plan(undefined);
    const strength = plan({ goal: 'strength' });
    const reps = (p: typeof general) =>
      p.main.filter((e) => e.repTarget !== undefined).map((e) => e.repTarget!);
    expect(Math.max(...reps(strength))).toBeLessThanOrEqual(Math.max(...reps(general)) - 3);
    for (const e of strength.main.filter((x) => x.repTarget !== undefined)) {
      if (e.progressionFamilyId) expect(e.repTarget).toBeGreaterThanOrEqual(5);
    }
  });

  it('time fit still lands the session on its target under every goal', () => {
    for (const goal of ['general', 'strength', 'muscle', 'endurance'] as const) {
      for (const rest of ['shorter', 'standard', 'longer'] as const) {
        const p = plan({ goal, rest });
        expect({ goal, rest, under: p.estimatedMinutes <= 45 * 1.1 }).toEqual({
          goal,
          rest,
          under: true,
        });
        expect(p.main.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('variety', () => {
  it('consistent never blocks; varied blocks longer', () => {
    expect(recencyTier(1, cooldownWindowsFor('consistent'))).toBe('soft');
    expect(recencyTier(3, cooldownWindowsFor('consistent'))).toBe('preferred');
    expect(recencyTier(3, cooldownWindowsFor('varied'))).toBe('blocked');
    expect(recencyTier(3)).toBe('soft');
  });
});

describe('warm-up length', () => {
  it('short < standard < extended at every length, and extended still leaves a main block', () => {
    for (const t of [15, 30, 60]) {
      expect(warmupMinutesFor(t, 'short')).toBeLessThanOrEqual(warmupMinutesFor(t, 'standard'));
      expect(warmupMinutesFor(t, 'extended')).toBeGreaterThan(warmupMinutesFor(t, 'standard'));
      expect(cooldownMinutesFor(t, 'extended')).toBeGreaterThan(cooldownMinutesFor(t, 'standard'));
    }
    const sec = (p: ReturnType<typeof plan>) => p.warmup.reduce((a, e) => a + e.estimatedSec, 0);
    expect(sec(plan({ warmup: 'extended' }))).toBeGreaterThan(sec(plan({ warmup: 'short' })));
    expect(plan({ warmup: 'extended' }).main.length).toBeGreaterThanOrEqual(3);
  });
});

describe('progression pace', () => {
  const family = findFamily(families, 'horizontal_push')!;
  const level = family.levels[2];
  const anchor = byId.get(level.anchor_exercise_id)!;
  const start: ProgressionState = {
    familyId: 'horizontal_push',
    levelId: level.level_id,
    micro: defaultMicroForExercise(anchor),
    consecutiveHits: 0,
    consecutiveMisses: 0,
    lastLevelChangeAt: null,
  };
  const hit = {
    familyId: 'horizontal_push' as const,
    allSetsMetTarget: true,
    anySetBelowTarget: false,
    difficultyFeedback: 'just_right' as const,
  };

  it('patient banks one qualifying session, then steps on the second', () => {
    const first = applySessionResult(start, family, library, hit, { sessionsPerStep: 2 });
    expect(first.event.kind).toBe('hold');
    expect(first.state.micro).toEqual(start.micro);
    expect(first.state.consecutiveHits).toBe(1);
    const second = applySessionResult(first.state, family, library, hit, { sessionsPerStep: 2 });
    expect(second.event.kind).toBe('micro_advance');
    expect(second.state.micro.repTarget).toBe(start.micro.repTarget + 1);
    expect(second.state.consecutiveHits).toBe(0);
  });

  it('a miss in between resets the bank', () => {
    const first = applySessionResult(start, family, library, hit, { sessionsPerStep: 2 });
    const miss = applySessionResult(
      first.state,
      family,
      library,
      { ...hit, allSetsMetTarget: false, anySetBelowTarget: true },
      { sessionsPerStep: 2 },
    );
    expect(miss.state.consecutiveHits).toBe(0);
  });

  it('steady (the default) is unchanged: one session, one step', () => {
    expect(applySessionResult(start, family, library, hit).event.kind).toBe('micro_advance');
    expect(applySessionResult(start, family, library, hit, { sessionsPerStep: 1 })).toEqual(
      applySessionResult(start, family, library, hit),
    );
  });

  it('accessories bank the same way', () => {
    const curl = byId.get('bicep-curl')!;
    const state = { micro: defaultMicroForExercise(curl), consecutiveMisses: 0 };
    const perf = {
      allSetsMetTarget: true,
      anySetBelowTarget: false,
      difficultyFeedback: 'just_right' as const,
    };
    const first = applyAccessorySessionResult(state, curl, perf, 2);
    expect(first.event.kind).toBe('hold');
    expect(first.state.consecutiveHits).toBe(1);
    const second = applyAccessorySessionResult(first.state, curl, perf, 2);
    expect(second.event.kind).toBe('micro_advance');
  });
});

describe('learned changeover (UserProfile.changeoverSec)', () => {
  const pushUp = byId.get('bw-push-up')!;

  it('re-estimates a main entry with the learned allowance and records it on the entry', () => {
    const base = mainEntry();
    const slow = applyTrainingToMainEntry(base, pushUp, DEFAULT_TRAINING_PREFERENCES, 90);
    expect(slow.transitionSec).toBe(90);
    expect(slow.estimatedSec).toBe(base.estimatedSec + 30);
    // The default 60s leaves the entry exactly as it was.
    expect(applyTrainingToMainEntry(base, pushUp, DEFAULT_TRAINING_PREFERENCES, 60)).toBe(base);
    // A later re-estimate (time fit trimming a set) keeps the allowance.
    expect(estimateEntrySec({ ...slow, sets: 2 })).toBe(
      estimateEntrySec({ ...base, sets: 2 }) + 30,
    );
  });

  it('a slow changer gets fewer exercises in the same 45 minutes than a quick one', () => {
    const withChangeover = (changeoverSec: number) =>
      generateSession({
        library: exerciseLibrary,
        families: familyLibrary,
        userState: { ...userState(), profile: { ...userState().profile, changeoverSec } },
        request: { focus: 'upper', difficulty: 'medium', targetMinutes: 45 },
        clock: { today: TODAY, tzId: 'UTC' },
        rng: createRng(5),
      });
    const quick = withChangeover(30);
    const slow = withChangeover(150);
    const sets = (p: typeof quick) => p.main.reduce((a, e) => a + e.sets, 0);
    expect(sets(slow)).toBeLessThan(sets(quick));
    expect(slow.estimatedMinutes).toBeLessThanOrEqual(Math.ceil(45 * 1.1));
  });
});
