/**
 * The strength-gain derivation. The cases worth pinning down are the ones where "did I improve?"
 * is not simply "is the last number bigger": a heavy session followed by a light one, a rep gain
 * with a flat band, a band gain with flat reps, and a timed exercise where the unit is seconds.
 */
import type { exerciseCatalogRepo } from '@roamfit/store';
import {
  buildExerciseProgress,
  formatLocalDate,
  gainLines,
  progressSummary,
  progressUnit,
  unitLabel,
} from './exerciseProgress';

type Performance = exerciseCatalogRepo.ExerciseSessionPerformance;

let seq = 0;
function session(overrides: Partial<Performance> & { localDate: string }): Performance {
  seq += 1;
  return {
    sessionId: `s${seq}`,
    setsCompleted: 3,
    bestReps: null,
    bestSeconds: null,
    totalReps: 0,
    totalSeconds: 0,
    band: null,
    restSec: 60,
    tempoSec: 3,
    ...overrides,
  };
}

const reps = (
  localDate: string,
  best: number,
  total = best * 3,
  extra: Partial<Performance> = {},
) => session({ localDate, bestReps: best, totalReps: total, ...extra });

describe('with no history', () => {
  const progress = buildExerciseProgress([], 'reps');

  it('is empty rather than zeroed', () => {
    expect(progress.sessions).toBe(0);
    expect(progress.chart).toEqual([]);
    expect(progress.bestSet).toBeNull();
    expect(progress.band).toBeNull();
    expect(progress.hasGain).toBe(false);
    expect(progress.firstDate).toBeNull();
  });

  it('says so without implying a failure', () => {
    expect(progressSummary(progress)).toBe(
      'No sessions logged yet — this is where your history lands.',
    );
  });
});

describe('a single session', () => {
  const progress = buildExerciseProgress([reps('2026-08-01', 10)], 'reps');

  it('charts it, and calls it a baseline rather than a plateau', () => {
    expect(progress.chart).toEqual([{ localDate: '2026-08-01', value: 10 }]);
    expect(progress.hasGain).toBe(false);
    expect(progressSummary(progress)).toBe('One session logged. That is your baseline.');
  });
});

describe('rep progression', () => {
  const history = [reps('2026-08-01', 8), reps('2026-08-05', 10), reps('2026-08-10', 12)];
  const progress = buildExerciseProgress(history, 'reps');

  it('charts the best set per session, oldest first', () => {
    expect(progress.chart).toEqual([
      { localDate: '2026-08-01', value: 8 },
      { localDate: '2026-08-05', value: 10 },
      { localDate: '2026-08-10', value: 12 },
    ]);
  });

  it('reports the gain against the first session', () => {
    expect(progress.bestSet).toEqual({ first: 8, latest: 12, best: 12, improved: true });
    expect(progress.hasGain).toBe(true);
    expect(progressSummary(progress)).toBe('Stronger than your first session on Aug 1.');
  });

  it('charts total volume alongside the best set', () => {
    expect(progress.volumeChart.map((p) => p.value)).toEqual([24, 30, 36]);
    expect(progress.volume?.improved).toBe(true);
  });
});

describe('a gain is not taken back by a lighter day', () => {
  const progress = buildExerciseProgress(
    [reps('2026-08-01', 8), reps('2026-08-05', 14), reps('2026-08-10', 9)],
    'reps',
  );

  it('still counts the improvement, and still reports the latest honestly', () => {
    expect(progress.bestSet).toEqual({ first: 8, latest: 9, best: 14, improved: true });
    expect(progress.hasGain).toBe(true);
  });
});

describe('no gain yet', () => {
  const progress = buildExerciseProgress(
    [reps('2026-08-01', 10), reps('2026-08-05', 10), reps('2026-08-10', 9)],
    'reps',
  );

  it('is stated neutrally — never as a decline', () => {
    expect(progress.hasGain).toBe(false);
    expect(progressSummary(progress)).toBe('3 sessions logged. Holding steady.');
    expect(gainLines(progress).every((line) => !line.improved)).toBe(true);
    // The best number is shown on its own, with no "down from" framing.
    expect(gainLines(progress)[0]).toEqual({
      label: 'Best set',
      detail: '10 reps',
      improved: false,
    });
  });
});

describe('the other dimensions', () => {
  it('counts more sets at the same reps as a gain', () => {
    const progress = buildExerciseProgress(
      [
        reps('2026-08-01', 10, 20, { setsCompleted: 2 }),
        reps('2026-08-05', 10, 40, { setsCompleted: 4 }),
      ],
      'reps',
    );
    expect(progress.bestSet?.improved).toBe(false);
    expect(progress.sets).toEqual({ first: 2, latest: 4, best: 4, improved: true });
    expect(progress.hasGain).toBe(true);
  });

  it('counts a heavier band at the same reps as a gain', () => {
    const progress = buildExerciseProgress(
      [reps('2026-08-01', 10, 30, { band: 'B1' }), reps('2026-08-05', 10, 30, { band: 'B3' })],
      'reps',
    );
    expect(progress.band).toEqual({ first: 'B1', latest: 'B3', best: 'B3', improved: true });
    expect(progress.hasGain).toBe(true);
  });

  it('has no band row for bodyweight work', () => {
    const progress = buildExerciseProgress([reps('2026-08-01', 10)], 'reps');
    expect(progress.band).toBeNull();
    expect(gainLines(progress).map((l) => l.label)).not.toContain('Band');
  });

  it('holds a longer time under tension as a gain', () => {
    const progress = buildExerciseProgress(
      [
        session({ localDate: '2026-08-01', bestSeconds: 30, totalSeconds: 60 }),
        session({ localDate: '2026-08-05', bestSeconds: 45, totalSeconds: 120 }),
      ],
      'time',
    );
    expect(progress.unit).toBe('seconds');
    expect(progress.chart.map((p) => p.value)).toEqual([30, 45]);
    expect(gainLines(progress).map((l) => l.label)).toContain('Time under tension');
    expect(gainLines(progress)[0].detail).toBe('30s → 45s');
  });
});

describe('unit selection', () => {
  it('follows the logs, not the record, when they disagree', () => {
    const history = [session({ localDate: '2026-08-01', bestSeconds: 40, totalSeconds: 80 })];
    expect(progressUnit(history, 'reps')).toBe('seconds');
  });

  it('falls back to the record when there is nothing logged either way', () => {
    expect(progressUnit([], 'time')).toBe('seconds');
    expect(progressUnit([], 'amrap')).toBe('reps');
  });

  it('skips a session that logged nothing in the charted unit, rather than plotting a zero', () => {
    const progress = buildExerciseProgress(
      [reps('2026-08-01', 10), session({ localDate: '2026-08-05' }), reps('2026-08-10', 12)],
      'reps',
    );
    expect(progress.chart.map((p) => p.localDate)).toEqual(['2026-08-01', '2026-08-10']);
    // The skipped-in-unit session still counts as a session that happened.
    expect(progress.sessions).toBe(3);
  });
});

describe('formatting', () => {
  it('renders a local_date without going through UTC', () => {
    expect(formatLocalDate('2026-08-01')).toBe('Aug 1');
    expect(formatLocalDate('2026-12-31')).toBe('Dec 31');
  });

  it('pluralises reps and suffixes seconds', () => {
    expect(unitLabel('reps', 1)).toBe('1 rep');
    expect(unitLabel('reps', 12)).toBe('12 reps');
    expect(unitLabel('seconds', 45)).toBe('45s');
  });
});
