/**
 * The workout history view model. What matters: the date comes from `local_date` without `Date`
 * parsing, removed-at-approval entries never show, skipped sets stay neutral facts, and sections
 * keep Warm-up / Main / Cooldown order.
 */
import type { sessionsRepo } from '@roamfit/store';
import { buildSessionHistoryView, formatFullLocalDate } from './sessionHistory';

type Session = sessionsRepo.SessionRecord;
type Entry = sessionsRepo.SessionEntryRecord;
type SetLog = sessionsRepo.SetLogRecord;

const EXERCISES = [
  { id: 'a', name: 'Alpha Press' },
  { id: 'b', name: 'Bravo Hold' },
  { id: 'c', name: 'Charlie Stretch' },
];

function set(i: number, over: Partial<SetLog> = {}): SetLog {
  return {
    id: `set-${i}`,
    entryId: 'e',
    setIndex: i,
    status: 'completed',
    repsPrescribed: null,
    secondsPrescribed: null,
    repsActual: null,
    secondsActual: null,
    bandActual: null,
    startedAt: null,
    completedAt: null,
    restPrescribedSec: 60,
    restTakenSec: null,
    restExtendedCount: 0,
    pauseCount: 0,
    pausedDurationSec: 0,
    ...over,
  };
}

function entry(id: string, over: Partial<Entry> & { setLogs: SetLog[] }): Entry {
  return {
    id,
    sessionId: 's',
    section: 'main',
    orderIndex: 0,
    plannedExerciseId: 'a',
    exerciseId: 'a',
    role: 'main',
    group: null,
    band: null,
    sets: 3,
    repTarget: 8,
    durationSec: null,
    restSec: 60,
    tempoSec: 3,
    notes: null,
    difficulty: 'medium',
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: 'x',
    anchorClass: 'none',
    unilateral: false,
    estimatedSec: 100,
    substitutedFor: null,
    unplanned: false,
    entryStatus: 'planned',
    difficultyFeedback: null,
    demoMediaExpanded: false,
    ...over,
  };
}

function session(entries: Entry[], over: Partial<Session> = {}): Session {
  return {
    id: 's',
    status: 'completed',
    localDate: '2026-09-03',
    focus: 'legs',
    isQuick: false,
    estimatedMinutes: 30,
    actualMinutes: 27,
    retrospective: null,
    city: null,
    country: null,
    region: null,
    countryCode: null,
    entries,
    ...over,
  } as Session;
}

describe('formatFullLocalDate', () => {
  it('names the weekday from the date parts, not from Date string parsing', () => {
    expect(formatFullLocalDate('2026-09-03')).toBe('Thursday, September 3, 2026');
    expect(formatFullLocalDate('2026-01-01')).toBe('Thursday, January 1, 2026');
    expect(formatFullLocalDate('2025-12-31')).toBe('Wednesday, December 31, 2025');
  });
  it('returns junk input unchanged', () => {
    expect(formatFullLocalDate('nope')).toBe('nope');
  });
});

describe('buildSessionHistoryView', () => {
  it('builds the header: focus label/emoji, actual minutes over estimate, place hidden when none', () => {
    const v = buildSessionHistoryView(session([]), EXERCISES);
    expect(v).toMatchObject({
      dateLabel: 'Thursday, September 3, 2026',
      focusLabel: 'Legs',
      emoji: '🦵',
      minutes: 27,
      place: null,
      note: null,
    });
    const est = buildSessionHistoryView(session([], { actualMinutes: null }), EXERCISES);
    expect(est.minutes).toBe(30);
    // The stored actual is fractional; the page shows whole minutes, never "0 min".
    expect(buildSessionHistoryView(session([], { actualMinutes: 27.4 }), EXERCISES).minutes).toBe(
      27,
    );
    expect(buildSessionHistoryView(session([], { actualMinutes: 0.0003 }), EXERCISES).minutes).toBe(
      1,
    );
  });

  it('uses the Quick Session label and the place string when resolved', () => {
    const v = buildSessionHistoryView(
      session([], { isQuick: true, city: 'Bend', region: 'OR', countryCode: 'US' }),
      EXERCISES,
    );
    expect(v.focusLabel).toBe('Quick session');
    expect(v.place).toBe('Bend, OR, USA');
  });

  it('formats reps as "8 · 8 · 7 reps" and timed work as "30s · 30s", with the heaviest band', () => {
    const v = buildSessionHistoryView(
      session([
        entry('e1', {
          exerciseId: 'a',
          band: 'B2',
          setLogs: [
            set(2, { repsActual: 7 }),
            set(0, { repsActual: 8 }),
            set(1, { repsActual: 8, bandActual: 'B3' }),
          ],
        }),
        entry('e2', {
          exerciseId: 'b',
          orderIndex: 1,
          setLogs: [set(0, { secondsActual: 30 }), set(1, { secondsActual: 30 })],
        }),
      ]),
      EXERCISES,
    );
    const [r1, r2] = v.sections[0].rows;
    expect(r1).toMatchObject({ name: 'Alpha Press', setsText: '8 · 8 · 7 reps', band: 'B3' });
    expect(r2).toMatchObject({ name: 'Bravo Hold', setsText: '30s · 30s', band: null });
  });

  it('shows skipped sets as a neutral note and keeps the completed ones', () => {
    const v = buildSessionHistoryView(
      session([
        entry('e1', {
          setLogs: [set(0, { repsActual: 8 }), set(1, { status: 'skipped' })],
        }),
        entry('e2', { orderIndex: 1, exerciseId: 'b', setLogs: [set(0, { status: 'skipped' })] }),
        entry('e3', {
          orderIndex: 2,
          exerciseId: 'c',
          setLogs: [set(0, { status: 'not_reached' })],
        }),
      ]),
      EXERCISES,
    );
    const rows = v.sections[0].rows;
    expect(rows[0]).toMatchObject({ setsText: '8 reps', skippedNote: '1 set skipped' });
    expect(rows[1]).toMatchObject({ setsText: '', skippedNote: '1 set skipped' });
    expect(rows[2]).toMatchObject({ setsText: '', skippedNote: 'Not reached' });
  });

  it('drops removed_at_approval entries and groups Warm-up / Main / Cooldown in order', () => {
    const v = buildSessionHistoryView(
      session([
        entry('cool', {
          section: 'cooldown',
          orderIndex: 9,
          setLogs: [set(0, { secondsActual: 20 })],
        }),
        entry('main', { section: 'main', orderIndex: 5, setLogs: [set(0, { repsActual: 5 })] }),
        entry('warm', {
          section: 'warmup',
          orderIndex: 0,
          setLogs: [set(0, { secondsActual: 30 })],
        }),
        entry('gone', {
          section: 'main',
          orderIndex: 6,
          entryStatus: 'removed_at_approval',
          setLogs: [set(0, { repsActual: 5 })],
        }),
      ]),
      EXERCISES,
    );
    expect(v.sections.map((s) => s.title)).toEqual(['Warm-up', 'Main', 'Cooldown']);
    expect(v.sections.flatMap((s) => s.rows.map((r) => r.entryId))).toEqual([
      'warm',
      'main',
      'cool',
    ]);
  });

  it('carries the headline totals from the completion stats, and the family id for a Trail link', () => {
    const v = buildSessionHistoryView(
      session([
        entry('e1', {
          band: 'B2',
          progressionFamilyId: 'fam',
          setLogs: [set(0, { repsActual: 8 }), set(1, { repsActual: 6 })],
        }),
      ]),
      EXERCISES,
    );
    expect(v.stats.map((s) => s.label)).toEqual(['1 exercise', '2 sets', '14 reps', 'Top band B2']);
    expect(v.sections[0].rows[0].familyId).toBe('fam');
  });

  it('shows the retrospective note when one exists and falls back to the id for an unknown exercise', () => {
    const v = buildSessionHistoryView(
      session([entry('e1', { exerciseId: 'mystery', setLogs: [set(0, { repsActual: 1 })] })], {
        retrospective: '  felt great  ',
      }),
      EXERCISES,
    );
    expect(v.note).toBe('felt great');
    expect(v.sections[0].rows[0].name).toBe('mystery');
  });
});
