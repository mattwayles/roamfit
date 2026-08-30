import { exerciseLibrary } from '@roamfit/data';
import { buildFocusTemplate, buildQuickSessionTemplate } from './focusTemplate';
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
