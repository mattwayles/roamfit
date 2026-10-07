/**
 * The workout history page's view model: a finished `SessionRecord` turned into exactly what the
 * page prints. Pure — no I/O, no React — like `sessionStats.ts` and `exerciseProgress.ts`; the
 * caller loads the session, this derives.
 *
 * Never punish (invariant 4): a skipped set is shown as a plain neutral fact, never a deficit, and
 * nothing here compares the session against its plan. The date is formatted from `local_date` by
 * hand (invariant 6) — `new Date('2026-09-03')` would read it as UTC midnight and print the day
 * before west of Greenwich.
 */
import type { sessionsRepo } from '@roamfit/store';
import { BAND_ORDER } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { Exercise, Focus } from '@roamfit/data';
import { FOCUS_EMOJI, QUICK_EMOJI } from './dayMarkers';
import { FOCUS_LABELS } from './focusLabels';
import { formatPlace } from './place';
import { buildSessionCompletionStats } from './sessionStats';

type SessionRecord = sessionsRepo.SessionRecord;
type SessionEntryRecord = sessionsRepo.SessionEntryRecord;
type Section = SessionEntryRecord['section'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2026-09-03` -> `Thursday, September 3, 2026`. The weekday comes from `Date.UTC` on the parsed
 *  parts, never from parsing the string. Falls back to the raw string if it isn't a date. */
export function formatFullLocalDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const month = MONTHS[(m ?? 0) - 1];
  if (!y || !month || !d) return localDate;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${month} ${d}, ${y}`;
}

export interface HistoryStat {
  key: string;
  label: string;
}

export interface HistoryExerciseRow {
  entryId: string;
  exerciseId: string;
  name: string;
  /** The heaviest band used on a completed set (a logged correction wins over the prescription);
   *  null for bodyweight work. */
  band: BandId | null;
  /** "8 · 8 · 7 reps", "30s · 30s", or "" when no set was completed. */
  setsText: string;
  completedSets: number;
  skippedSets: number;
  /** Neutral one-liner for sets not done ("1 set skipped", "Not reached"); null when all done. */
  skippedNote: string | null;
}

export interface HistorySection {
  section: Section;
  title: string;
  rows: HistoryExerciseRow[];
}

export interface SessionHistoryView {
  sessionId: string;
  localDate: string;
  dateLabel: string;
  focus: Focus;
  focusLabel: string;
  emoji: string;
  /** `actualMinutes ?? estimatedMinutes`, rounded (the stored actual is fractional), at least 1. */
  minutes: number;
  /** Null when the session has no resolved place (the row is hidden). */
  place: string | null;
  stats: HistoryStat[];
  sections: HistorySection[];
  /** The user's own retrospective note, when they wrote one. */
  note: string | null;
}

const SECTION_TITLES: Record<Section, string> = {
  warmup: 'Warm-up',
  main: 'Main',
  cooldown: 'Cooldown',
};
const SECTION_ORDER: Section[] = ['warmup', 'main', 'cooldown'];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function buildRow(
  entry: SessionEntryRecord,
  nameOf: (exerciseId: string) => string,
): HistoryExerciseRow {
  const done = entry.setLogs
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.setIndex - b.setIndex);
  const skipped = entry.setLogs.filter((s) => s.status === 'skipped').length;

  const parts = done.map((s) =>
    s.repsActual !== null
      ? String(s.repsActual)
      : s.secondsActual !== null
        ? `${s.secondsActual}s`
        : '✓',
  );
  const allReps = done.length > 0 && done.every((s) => s.repsActual !== null);
  const setsText = parts.length === 0 ? '' : parts.join(' · ') + (allReps ? ' reps' : '');

  let band: BandId | null = null;
  for (const s of done) {
    const b = s.bandActual ?? entry.band;
    if (b && (band === null || BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(band))) band = b;
  }

  const skippedNote =
    skipped > 0
      ? plural(skipped, 'set skipped', 'sets skipped')
      : done.length === 0
        ? 'Not reached'
        : null;

  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    name: nameOf(entry.exerciseId),
    band,
    setsText,
    completedSets: done.length,
    skippedSets: skipped,
    skippedNote,
  };
}

export function buildSessionHistoryView(
  session: SessionRecord,
  exercises: Pick<Exercise, 'id' | 'name'>[],
): SessionHistoryView {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => names.get(id) ?? id;

  const live = session.entries
    .filter((e) => e.entryStatus !== 'removed_at_approval')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const sections: HistorySection[] = [];
  for (const section of SECTION_ORDER) {
    const rows = live.filter((e) => e.section === section).map((e) => buildRow(e, nameOf));
    if (rows.length > 0) sections.push({ section, title: SECTION_TITLES[section], rows });
  }

  const totals = buildSessionCompletionStats(session);
  const stats: HistoryStat[] = [
    { key: 'exercises', label: plural(totals.exercisesTrained, 'exercise', 'exercises') },
    { key: 'sets', label: plural(totals.setsCompleted, 'set', 'sets') },
  ];
  if (totals.totalReps > 0)
    stats.push({ key: 'reps', label: plural(totals.totalReps, 'rep', 'reps') });
  if (totals.totalSeconds > 0) {
    stats.push({ key: 'seconds', label: `${formatSeconds(totals.totalSeconds)} held` });
  }
  if (totals.heaviestBand) stats.push({ key: 'band', label: `Top band ${totals.heaviestBand}` });

  const note = session.retrospective?.trim();
  return {
    sessionId: session.id,
    localDate: session.localDate,
    dateLabel: formatFullLocalDate(session.localDate),
    focus: session.focus,
    focusLabel: session.isQuick ? 'Quick session' : FOCUS_LABELS[session.focus],
    emoji: session.isQuick ? QUICK_EMOJI : FOCUS_EMOJI[session.focus],
    minutes: Math.max(1, Math.round(session.actualMinutes ?? session.estimatedMinutes)),
    place: formatPlace(session),
    stats,
    sections,
    note: note ? note : null,
  };
}
