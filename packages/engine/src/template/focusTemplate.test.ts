import { exerciseLibrary } from '@roamfit/data';
import {
  accessoryRotationOffset,
  buildFocusTemplate,
  buildQuickSessionTemplate,
  expandOptionalSlots,
} from './focusTemplate';
import type { SessionHistoryRecord } from '../types';

const lib = exerciseLibrary.exercises;
const noHistory: SessionHistoryRecord[] = [];

describe('§5.5 focus templates', () => {
  it('upper (>=25min) has equal push and pull pattern slots', () => {
    const { slots } = buildFocusTemplate({
      focus: 'upper',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    const pushSlots = slots.filter((s) =>
      s.patterns.some((p) => p === 'horizontal_push' || p === 'vertical_push'),
    );
    const pullSlots = slots.filter((s) =>
      s.patterns.some((p) => p === 'horizontal_pull' || p === 'vertical_pull'),
    );
    expect(pushSlots.length).toBe(pullSlots.length);
  });

  it('upper under 25 min collapses to the compressed 4-slot template', () => {
    const { slots } = buildFocusTemplate({
      focus: 'upper',
      targetMinutes: 20,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    expect(slots.length).toBe(4);
    expect(slots[0].patterns).toEqual(['horizontal_push']);
    expect(slots[1].patterns).toEqual(['horizontal_pull']);
  });

  it('abs is never all-flexion — the flexion slot is one of several distinct required patterns', () => {
    const { slots } = buildFocusTemplate({
      focus: 'abs',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    const requiredPatterns = new Set(slots.filter((s) => s.required).flatMap((s) => s.patterns));
    expect(requiredPatterns.size).toBeGreaterThan(1);
    expect(requiredPatterns.has('flexion')).toBe(true);
  });

  it('abs rotates which pattern leads based on the most recent abs session', () => {
    const first = buildFocusTemplate({
      focus: 'abs',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    const leadExercise = lib.find(
      (e) => e.roles.includes('main') && e.pattern === first.leadPattern && e.focus.includes('abs'),
    )!;
    const historyAfter: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-20',
        focus: 'abs',
        difficulty: 'medium',
        status: 'completed',
        entries: [{ exerciseId: leadExercise.id, role: 'main', difficulty: 'medium' }],
      },
    ];
    const second = buildFocusTemplate({
      focus: 'abs',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: historyAfter,
    });
    expect(second.leadPattern).not.toBe(first.leadPattern);
  });

  it('full template adds a finisher slot when hard or >=40 minutes, not otherwise', () => {
    const easy = buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    const hard = buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      difficulty: 'hard',
      library: lib,
      history: noHistory,
    });
    const long = buildFocusTemplate({
      focus: 'full',
      targetMinutes: 45,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    expect(easy.slots.some((s) => s.isFinisher)).toBe(false);
    expect(hard.slots.some((s) => s.isFinisher)).toBe(true);
    expect(long.slots.some((s) => s.isFinisher)).toBe(true);
  });

  it('legs template requires squat and hinge (knee/hip-dominant balance)', () => {
    const { slots } = buildFocusTemplate({
      focus: 'legs',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    expect(slots.find((s) => s.id === 'legs.squat')?.required).toBe(true);
    expect(slots.find((s) => s.id === 'legs.hinge')?.required).toBe(true);
  });

  it('Quick Session template has at most 3 slots (§9.5)', () => {
    const { slots } = buildQuickSessionTemplate({
      focus: 'full',
      targetMinutes: 7,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });
    expect(slots.length).toBeLessThanOrEqual(3);
  });
});

// ADR 0010 — the appended accessory slot used to always be ACCESSORY_PATTERNS_BY_FOCUS[focus][0],
// so a 30-minute full-body session ended with a curl every single time.
describe('accessory slot rotation (ADR 0010)', () => {
  const base = () =>
    buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history: noHistory,
    });

  function extraPatterns(offset: number): string[] {
    // 30 minutes allows 6 main exercises; the full template supplies 5, so exactly one is added.
    return expandOptionalSlots(base(), 'full', 6, offset)
      .slots.filter((s) => s.id.startsWith('full.extra.'))
      .flatMap((s) => s.patterns);
  }

  /** How many distinct accessory patterns `full` cycles through — measured, not asserted, so
   *  adding an isolation pattern to the library does not fail these tests for no reason.
   *  Declared after `base`/`extraPatterns` because it calls them. */
  const FULL_ACCESSORY_COUNT = new Set(
    Array.from({ length: 40 }, (_, offset) => extraPatterns(offset)[0]),
  ).size;

  it('appends exactly one extra slot at a 30-minute target', () => {
    expect(extraPatterns(0)).toHaveLength(1);
  });

  it('advances the appended pattern as the offset advances, covering the whole list', () => {
    const seen = new Set<string>();
    // Derived, not hardcoded: the accessory list grows whenever a new isolation pattern is added
    // to the library (it went 9 -> 11 with knee_flexion/knee_extension), and a literal here just
    // fails the next time that happens for no reason.
    for (let offset = 0; offset < FULL_ACCESSORY_COUNT; offset++) {
      seen.add(extraPatterns(offset)[0]);
    }
    expect(seen.size).toBe(FULL_ACCESSORY_COUNT); // every accessory pattern `full` can draw from
    expect(seen.has('elbow_flexion')).toBe(true);
  });

  it('wraps rather than running off the end of the pattern list', () => {
    expect(extraPatterns(FULL_ACCESSORY_COUNT)).toEqual(extraPatterns(0));
    expect(extraPatterns(FULL_ACCESSORY_COUNT * 2 + 1)).toEqual(extraPatterns(1));
  });

  it('defaults to the old offset-0 behavior when no offset is given', () => {
    const withoutArg = expandOptionalSlots(base(), 'full', 6)
      .slots.filter((s) => s.id.startsWith('full.extra.'))
      .flatMap((s) => s.patterns);
    expect(withoutArg).toEqual(extraPatterns(0));
  });

  it('counts every session of the same focus, abandoned ones included (ADR 0011)', () => {
    const history = [
      { focus: 'full', status: 'completed', entries: [] },
      { focus: 'full', status: 'discarded', entries: [] }, // shown to the user, so it counts
      { focus: 'upper', status: 'completed', entries: [] }, // different focus, does not
      { focus: 'full', status: 'completed', entries: [] },
    ] as unknown as SessionHistoryRecord[];
    expect(accessoryRotationOffset(history, 'full')).toBe(3);
  });
});

describe('full-body alternates the knee-dominant lower slot (squat <-> lunge)', () => {
  function build(history: SessionHistoryRecord[]) {
    return buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      difficulty: 'medium',
      library: lib,
      history,
    });
  }

  function kneePattern(history: SessionHistoryRecord[]) {
    return build(history).slots.find((s) => s.id === 'full.lower_knee')!.patterns[0];
  }

  function sessionWith(exerciseId: string, status = 'completed'): SessionHistoryRecord {
    return {
      focus: 'full',
      status,
      entries: [{ exerciseId, role: 'main', status: 'completed' }],
    } as unknown as SessionHistoryRecord;
  }

  it('leads with squat at cold start', () => {
    expect(kneePattern([])).toBe('squat');
  });

  it('switches to lunge after a full-body session that squatted', () => {
    expect(kneePattern([sessionWith('goblet-squat')])).toBe('lunge');
  });

  it('switches back to squat after a full-body session that lunged', () => {
    expect(kneePattern([sessionWith('bw-walking-lunge')])).toBe('squat');
  });

  it('rotates on an abandoned session too — ADR 0011, abandoning is a "seen" signal', () => {
    expect(kneePattern([sessionWith('goblet-squat', 'discarded')])).toBe('lunge');
  });

  it('keeps rotating across repeated abandonments', () => {
    const history = [sessionWith('goblet-squat', 'discarded')];
    expect(kneePattern(history)).toBe('lunge');
    history.push(sessionWith('bw-walking-lunge', 'discarded'));
    expect(kneePattern(history)).toBe('squat');
    history.push(sessionWith('goblet-squat', 'discarded'));
    expect(kneePattern(history)).toBe('lunge');
  });

  it('still requires a hip-hinge slot alongside it, whichever way the knee slot went', () => {
    for (const history of [[], [sessionWith('goblet-squat')]]) {
      const { slots } = build(history);
      const hinge = slots.find((s) => s.id === 'full.lower_hinge')!;
      expect(hinge.patterns).toEqual(['hinge']);
      expect(hinge.required).toBe(true);
    }
  });
});
