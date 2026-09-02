import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { milestonesRepo } from '@roamfit/store';
import type { ProgressionEvent } from '@roamfit/engine';
import { buildCelebrationViewModel } from './celebration';

const horizontalPush = familyLibrary.families.find((f) => f.id === 'horizontal_push')!;
const maxLevel = horizontalPush.levels[horizontalPush.levels.length - 1];
const maxExercise = exerciseLibrary.exercises.find((e) => e.id === maxLevel.anchor_exercise_id)!;

function milestone(
  type: milestonesRepo.MilestoneType,
  payload: Record<string, unknown> = {},
): milestonesRepo.MilestoneRecord {
  return { id: 'm1', type, payload, sessionId: 's1', localDate: '2026-05-01' };
}

describe('§9.7/§6.4 celebration view model', () => {
  it('a level_up progression event becomes a full-screen celebration naming the new exercise', () => {
    const events: { familyId: string; event: ProgressionEvent }[] = [
      { familyId: 'horizontal_push', event: { kind: 'level_up', levelId: 'horizontal_push.l2' } },
    ];
    const vm = buildCelebrationViewModel(exerciseLibrary, familyLibrary, events, []);
    expect(vm.fullScreen).toHaveLength(1);
    expect(vm.fullScreen[0].kind).toBe('level_up');
    expect(vm.fullScreen[0]).toMatchObject({ familyName: horizontalPush.name });
  });

  it('a mastery_pr_check event + matching best_set_pr milestone becomes a full-screen Mastery celebration, not a quiet one', () => {
    const events: { familyId: string; event: ProgressionEvent }[] = [
      { familyId: 'horizontal_push', event: { kind: 'mastery_pr_check' } },
    ];
    const milestones = [milestone('best_set_pr', { exerciseId: maxExercise.id, value: 25 })];
    const vm = buildCelebrationViewModel(exerciseLibrary, familyLibrary, events, milestones);
    expect(vm.fullScreen).toHaveLength(1);
    expect(vm.fullScreen[0]).toMatchObject({ kind: 'mastery_pr', value: 25 });
    expect(vm.quiet).toHaveLength(0);
  });

  it('a best_set_pr with no accompanying mastery_pr_check is a quiet milestone, not full-screen', () => {
    const milestones = [milestone('best_set_pr', { exerciseId: 'bw-wall-push-up', value: 12 })];
    const vm = buildCelebrationViewModel(exerciseLibrary, familyLibrary, [], milestones);
    expect(vm.fullScreen).toHaveLength(0);
    expect(vm.quiet).toHaveLength(1);
    expect(vm.quiet[0].text).toContain('12');
  });

  it('nth_session, new_city, and recovery_week all surface as quiet, monotonic milestones', () => {
    const milestones = [
      milestone('nth_session', { n: 5 }),
      milestone('new_city', { city: 'Lisbon' }),
      milestone('recovery_week'),
    ];
    const vm = buildCelebrationViewModel(exerciseLibrary, familyLibrary, [], milestones);
    expect(vm.quiet.map((q) => q.type)).toEqual(['nth_session', 'new_city', 'recovery_week']);
    expect(vm.quiet.every((q) => q.text.length > 0)).toBe(true);
  });

  it('no events, no milestones -> empty celebration (a plain completion, still fine)', () => {
    const vm = buildCelebrationViewModel(exerciseLibrary, familyLibrary, [], []);
    expect(vm.fullScreen).toEqual([]);
    expect(vm.quiet).toEqual([]);
  });
});
