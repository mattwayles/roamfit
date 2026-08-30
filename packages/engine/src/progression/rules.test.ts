import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import { applySessionResult } from './rules';
import { findFamily } from './ladder';
import { defaultMicroForExercise } from './micro';
import type { ProgressionState } from '../types';
import type { SessionPerformance } from './rules.types';

const library = exerciseLibrary.exercises;
const family = findFamily(familyLibrary.families, 'horizontal_push')!;

function stateAt(levelId: string, overrides: Partial<ProgressionState> = {}): ProgressionState {
  const exId = family.levels.find((l) => l.level_id === levelId)!.exercise_id;
  const exercise = library.find((e) => e.id === exId)!;
  return {
    familyId: 'horizontal_push',
    levelId,
    micro: defaultMicroForExercise(exercise),
    calibrating: false,
    consecutiveHits: 0,
    consecutiveMisses: 0,
    lastLevelChangeAt: null,
    ...overrides,
  };
}

function perf(overrides: Partial<SessionPerformance>): SessionPerformance {
  return {
    familyId: 'horizontal_push',
    allSetsAtOrAboveTop: false,
    missedBottom: false,
    difficultyFeedback: 'just_right',
    ...overrides,
  };
}

describe('§6.3 advance / regress / drop-a-level', () => {
  it('advances one micro-step when all sets hit the top of the range and feedback is not too_hard', () => {
    const result = applySessionResult(
      stateAt('horizontal_push.l3'),
      family,
      library,
      perf({ allSetsAtOrAboveTop: true }),
    );
    expect(result.event).toEqual({ kind: 'micro_advance' });
    expect(result.state.micro.repTarget).toBe(11);
  });

  it('does not advance when top-of-range is hit but feedback was too_hard', () => {
    const result = applySessionResult(
      stateAt('horizontal_push.l3'),
      family,
      library,
      perf({ allSetsAtOrAboveTop: true, difficultyFeedback: 'too_hard' }),
    );
    expect(result.event.kind).not.toBe('micro_advance');
  });

  it('regresses after one too_hard combined with missing the bottom of the range', () => {
    // Start one micro-step above the floor so this isn't the at-bottom/drop-a-level path.
    const advanced = applySessionResult(
      stateAt('horizontal_push.l3'),
      family,
      library,
      perf({ allSetsAtOrAboveTop: true }),
    ).state;
    const result = applySessionResult(
      advanced,
      family,
      library,
      perf({ missedBottom: true, difficultyFeedback: 'too_hard' }),
    );
    expect(result.event.kind).toBe('micro_regress');
  });

  it('does not regress on a single missed-bottom session without too_hard (needs two consecutive)', () => {
    const result = applySessionResult(
      stateAt('horizontal_push.l3'),
      family,
      library,
      perf({ missedBottom: true }),
    );
    expect(result.event).toEqual({ kind: 'hold' });
    expect(result.state.consecutiveMisses).toBe(1); // tracked so a second miss can trigger below
  });

  it('regresses on the second consecutive missed-bottom session, with no too_hard rating at all', () => {
    // Start one micro-step above the floor so the regress branch decrements micro rather than
    // hitting the at-bottom/drop-a-level path.
    const advanced = applySessionResult(
      stateAt('horizontal_push.l3'),
      family,
      library,
      perf({ allSetsAtOrAboveTop: true }),
    ).state;
    const first = applySessionResult(advanced, family, library, perf({ missedBottom: true }));
    expect(first.event).toEqual({ kind: 'hold' });
    const second = applySessionResult(first.state, family, library, perf({ missedBottom: true }));
    expect(second.event.kind).toBe('micro_regress');
  });

  it('drops a level after two consecutive regressions at the bottom micro-step', () => {
    const bottomState = stateAt('horizontal_push.l3'); // already at the floor micro-step
    const first = applySessionResult(
      bottomState,
      family,
      library,
      perf({ missedBottom: true, difficultyFeedback: 'too_hard' }),
    );
    expect(first.event).toEqual({ kind: 'hold' });
    expect(first.state.consecutiveMisses).toBe(1);
    const second = applySessionResult(
      first.state,
      family,
      library,
      perf({ missedBottom: true, difficultyFeedback: 'too_hard' }),
    );
    expect(second.event).toEqual({ kind: 'level_down', levelId: 'horizontal_push.l2' });
  });

  it('advancing past the max micro-step at a non-max level moves to the next level_id', () => {
    // l3 = bw-knee-push-up, bodyweight. Walk micro to its cap, then one more advance.
    let state = stateAt('horizontal_push.l3');
    const advances = [
      'micro_advance',
      'micro_advance',
      'micro_advance',
      'micro_advance',
      'micro_advance',
    ];
    for (const expected of advances) {
      const r = applySessionResult(state, family, library, perf({ allSetsAtOrAboveTop: true }));
      expect(r.event.kind).toBe(expected);
      state = r.state;
    }
    const levelUp = applySessionResult(state, family, library, perf({ allSetsAtOrAboveTop: true }));
    expect(levelUp.event).toEqual({ kind: 'level_up', levelId: 'horizontal_push.l4' });
  });

  it('§6.7 mastery — at the max level, an exhausted micro-progression is a PR check, never a dead end', () => {
    let state = stateAt('horizontal_push.l9'); // max level of a 9-level family
    for (let i = 0; i < 5; i++) {
      const r = applySessionResult(state, family, library, perf({ allSetsAtOrAboveTop: true }));
      state = r.state;
    }
    const result = applySessionResult(state, family, library, perf({ allSetsAtOrAboveTop: true }));
    expect(result.event).toEqual({ kind: 'mastery_pr_check' });
    expect(result.state.levelId).toBe('horizontal_push.l9'); // never advances past the top
  });
});
