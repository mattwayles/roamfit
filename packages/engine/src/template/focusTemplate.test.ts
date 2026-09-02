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
      effort: 'normal',
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
      effort: 'normal',
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
      effort: 'normal',
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
      effort: 'normal',
      library: lib,
      history: noHistory,
    });
    const leadExercise = lib.find(
      (e) => e.role === 'main' && e.pattern === first.leadPattern && e.focus.includes('abs'),
    )!;
    const historyAfter: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-20',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: leadExercise.id, role: 'main', effort: 'normal' }],
      },
    ];
    const second = buildFocusTemplate({
      focus: 'abs',
      targetMinutes: 30,
      effort: 'normal',
      library: lib,
      history: historyAfter,
    });
    expect(second.leadPattern).not.toBe(first.leadPattern);
  });

  it('full template adds a finisher slot when hard or >=40 minutes, not otherwise', () => {
    const easy = buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      effort: 'normal',
      library: lib,
      history: noHistory,
    });
    const hard = buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      effort: 'hard',
      library: lib,
      history: noHistory,
    });
    const long = buildFocusTemplate({
      focus: 'full',
      targetMinutes: 45,
      effort: 'normal',
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
      effort: 'normal',
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
      effort: 'normal',
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
      effort: 'normal',
      library: lib,
      history: noHistory,
    });

  function extraPatterns(offset: number): string[] {
    // 30 minutes allows 6 main exercises; the full template supplies 5, so exactly one is added.
    return expandOptionalSlots(base(), 'full', 6, offset)
      .slots.filter((s) => s.id.startsWith('full.extra.'))
      .flatMap((s) => s.patterns);
  }

  it('appends exactly one extra slot at a 30-minute target', () => {
    expect(extraPatterns(0)).toHaveLength(1);
  });

  it('advances the appended pattern as the offset advances, covering the whole list', () => {
    const seen = new Set<string>();
    for (let offset = 0; offset < 9; offset++) seen.add(extraPatterns(offset)[0]);
    expect(seen.size).toBe(9); // every accessory pattern `full` can draw from
    expect(seen.has('elbow_flexion')).toBe(true);
  });

  it('wraps rather than running off the end of the pattern list', () => {
    expect(extraPatterns(9)).toEqual(extraPatterns(0));
    expect(extraPatterns(19)).toEqual(extraPatterns(1));
  });

  it('defaults to the old offset-0 behavior when no offset is given', () => {
    const withoutArg = expandOptionalSlots(base(), 'full', 6)
      .slots.filter((s) => s.id.startsWith('full.extra.'))
      .flatMap((s) => s.patterns);
    expect(withoutArg).toEqual(extraPatterns(0));
  });

  it('counts only non-discarded sessions of the same focus', () => {
    const history = [
      { focus: 'full', status: 'completed', entries: [] },
      { focus: 'full', status: 'discarded', entries: [] }, // abandoned: never happened (§5.2)
      { focus: 'upper', status: 'completed', entries: [] }, // different focus
      { focus: 'full', status: 'completed', entries: [] },
    ] as unknown as SessionHistoryRecord[];
    expect(accessoryRotationOffset(history, 'full')).toBe(2);
  });
});

describe('full-body alternates the knee-dominant lower slot (squat <-> lunge)', () => {
  function build(history: SessionHistoryRecord[]) {
    return buildFocusTemplate({
      focus: 'full',
      targetMinutes: 30,
      effort: 'normal',
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

  it('does not rotate on an abandoned session — discarded sessions never happened', () => {
    expect(kneePattern([sessionWith('goblet-squat', 'discarded')])).toBe('squat');
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
