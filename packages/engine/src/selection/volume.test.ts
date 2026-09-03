import type { Exercise } from '@roamfit/data';
import type { SessionHistoryRecord } from '../types';
import {
  overWorkedMuscles,
  untrainedMuscles,
  lowVolumeMuscles,
  recentHardMuscles,
  sameFocusTrainedYesterday,
} from './volume';

function ex(id: string, primary: string[], secondary: string[] = []): Exercise {
  return {
    id,
    name: id,
    aliases: [],
    focus: ['upper'],
    pattern: 'horizontal_push',
    primary,
    secondary,
    equipment: 'band',
    band: 'B1-B3',
    anchor: 'none',
    anchor_alt: null,
    anchor_class: 'none',
    unilateral: false,
    metric: 'reps',
    default_seconds: null,
    tier: 'core',
    roles: ['main'],
    difficulty: 'medium',
    progression_family: null,
    progression_level_id: null,
    contraindications: [],
    setup: '',
    video_search: '',
  };
}

const TODAY = '2026-08-30';

describe('trailing volume (§5.2)', () => {
  const library = [ex('chest1', ['chest']), ex('chest2', ['chest']), ex('tri1', ['triceps'])];

  it('OVER-WORKED — muscle at >1.5x the 7-day mean is flagged', () => {
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-28',
        focus: 'upper',
        difficulty: 'medium',
        status: 'completed',
        entries: [
          { exerciseId: 'chest1', role: 'main', difficulty: 'medium', sets: 3 },
          { exerciseId: 'chest2', role: 'main', difficulty: 'medium', sets: 3 },
          { exerciseId: 'tri1', role: 'main', difficulty: 'medium', sets: 1 },
        ],
      },
    ];
    const over = overWorkedMuscles(history, library, TODAY);
    expect(over.has('chest')).toBe(true);
    expect(over.has('triceps')).toBe(false);
  });

  it('a session older than the 7-day window does not count toward OVER-WORKED', () => {
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-01',
        focus: 'upper',
        difficulty: 'medium',
        status: 'completed',
        entries: [
          { exerciseId: 'chest1', role: 'main', difficulty: 'medium', sets: 5 },
          { exerciseId: 'tri1', role: 'main', difficulty: 'medium', sets: 1 },
        ],
      },
    ];
    const over = overWorkedMuscles(history, library, TODAY);
    expect(over.size).toBe(0);
  });

  it('UNTRAINED — a relevant muscle with zero 14-day volume is flagged', () => {
    const untrained = untrainedMuscles([], library, TODAY, new Set(['chest', 'triceps']));
    expect(untrained.has('chest')).toBe(true);
    expect(untrained.has('triceps')).toBe(true);
  });

  it('LOW — a relevant muscle with 1-2 sets in 14 days is flagged, 0 or >=3 is not', () => {
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-25',
        focus: 'upper',
        difficulty: 'medium',
        status: 'completed',
        entries: [{ exerciseId: 'chest1', role: 'main', difficulty: 'medium', sets: 2 }],
      },
    ];
    const low = lowVolumeMuscles(history, library, TODAY, new Set(['chest', 'triceps']));
    expect(low.has('chest')).toBe(true);
    expect(low.has('triceps')).toBe(false); // zero sets, not "low"
  });

  it('recentHardMuscles only counts main-role exercises prescribed at hard difficulty', () => {
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-29',
        focus: 'upper',
        difficulty: 'hard',
        status: 'completed',
        entries: [
          { exerciseId: 'chest1', role: 'main', difficulty: 'hard' },
          { exerciseId: 'tri1', role: 'main', difficulty: 'medium' },
        ],
      },
    ];
    const muscles = recentHardMuscles(history, library, TODAY, 2);
    expect(muscles.has('chest')).toBe(true);
    expect(muscles.has('triceps')).toBe(false);
  });

  it('sameFocusTrainedYesterday is true only for exactly 1 day ago', () => {
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-29',
        focus: 'upper',
        difficulty: 'medium',
        status: 'completed',
        entries: [],
      },
    ];
    expect(sameFocusTrainedYesterday(history, TODAY, 'upper')).toBe(true);
    expect(sameFocusTrainedYesterday(history, TODAY, 'legs')).toBe(false);
    expect(sameFocusTrainedYesterday(history, '2026-09-01', 'upper')).toBe(false);
  });
});
