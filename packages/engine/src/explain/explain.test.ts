import { composeExplanation } from './explain';

function base() {
  return {
    levelUps: [],
    masteryPrChecks: [],
    noveltyExerciseNames: [],
    substitutions: [],
    patternGaps: [],
  };
}

describe('§5.8 the explanation line', () => {
  it('is never empty, even with nothing notable to report', () => {
    expect(composeExplanation(base()).length).toBeGreaterThan(0);
  });

  it('names a 48h recovery adjustment', () => {
    const text = composeExplanation({ ...base(), recoveryMuscleLabel: 'shoulders' });
    expect(text).toMatch(/Lighter on shoulders/);
  });

  it('names a level-up', () => {
    const text = composeExplanation({
      ...base(),
      levelUps: [{ exerciseName: 'Push-ups', levelN: 5, levelOf: 9 }],
    });
    expect(text).toMatch(/Push-ups moved up to Level 5 of 9/);
  });

  it('names a mastery PR-check instead of going silent at the top of a ladder', () => {
    const text = composeExplanation({
      ...base(),
      masteryPrChecks: [{ exerciseName: 'One-arm push-up' }],
    });
    expect(text).toMatch(/new best set on One-arm push-up/);
  });

  it('names novelty exercises', () => {
    const text = composeExplanation({ ...base(), noveltyExerciseNames: ['Copenhagen plank'] });
    expect(text).toMatch(/New today: Copenhagen plank/);
  });

  it('names a progression substitution', () => {
    const text = composeExplanation({
      ...base(),
      substitutions: [{ fromName: 'Archer push-up', toName: 'Push-up' }],
    });
    expect(text).toMatch(/Archer push-up wasn't available, so Push-up instead/);
  });

  it('states a used-band PATTERN GAP resolution', () => {
    const text = composeExplanation({
      ...base(),
      patternGaps: [{ pattern: 'horizontal_pull', resolution: 'used_band' }],
    });
    expect(text).toMatch(/Used a band for rowing/);
  });

  it('absorbs a stated-imbalance PATTERN GAP silently — not every session needs every pattern', () => {
    const text = composeExplanation({
      ...base(),
      patternGaps: [{ pattern: 'horizontal_pull', resolution: 'stated_imbalance' }],
    });
    expect(text).not.toMatch(/rowing/);
    expect(text).not.toMatch(/unbalanced/);
  });

  it('carries the §9.4 comeback copy verbatim, first in the line', () => {
    const text = composeExplanation({ ...base(), comebackNotice: 'Welcome back — let’s ease in.' });
    expect(text.startsWith('Welcome back — let’s ease in.')).toBe(true);
  });

  it('shows the calibration notice only when flagged', () => {
    const text = composeExplanation({ ...base(), calibrationFirstSessionNotice: true });
    expect(text).toMatch(/first few sessions set your starting levels/);
  });

  it('names the pattern balanced against when nothing else is notable', () => {
    const text = composeExplanation({ ...base(), balancedAgainst: 'squat' });
    expect(text).toBe('Balanced to keep working squatting without repeating what you just did.');
  });

  // Track 14 — `conditioning`'s pattern label ("cardio work") reads fine on its own but clashes
  // grammatically with the generic "keep working X" frame ("keep working cardio work"). It gets
  // its own no-guilt phrasing instead.
  it('phrases a cardio-balanced session naturally instead of "keep working cardio work"', () => {
    const text = composeExplanation({ ...base(), balancedAgainst: 'conditioning' });
    expect(text).toBe('Mixed up to keep your heart rate up without repeating what you just did.');
    expect(text).not.toMatch(/cardio work/);
  });

  it('matches the spec §5.8 example shape: recovery + novelty + level-up together', () => {
    const text = composeExplanation({
      ...base(),
      recoveryMuscleLabel: 'shoulders',
      noveltyExerciseNames: ['Copenhagen plank'],
      levelUps: [{ exerciseName: 'Push-ups', levelN: 5, levelOf: 9 }],
    });
    expect(text).toMatch(/Lighter on shoulders/);
    expect(text).toMatch(/New today: Copenhagen plank/);
    expect(text).toMatch(/Push-ups moved up to Level 5 of 9/);
  });
});
