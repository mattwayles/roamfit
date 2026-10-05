/**
 * How a calendar day marker looks, shared by the Today tab's "This week" strip and the Journey
 * Logbook so the two can never disagree (DESIGN.md §5.1/§5.2). Emoji stay as the marker glyphs
 * (a deliberate carry-over, not a stray icon); the tint is a color *token name* the component
 * resolves through the theme (so it follows Daybreak / Midnight): trained = the session's focus
 * color, travel = sky, quick = gold, untrained = no tint at all (neutral, never
 * empty-looking-bad — invariant 4).
 */
import type { Focus } from '@roamfit/data';
import type { AccentName } from '../theme';
import type { DayMarker } from './dashboard';
import { FOCUS_TONE } from './focusLabels';

/** §14.1.6 — the marker shown on a trained day: one per focus, or a stopwatch for a Quick Session
 *  (§9.5), which is otherwise indistinguishable from a regular full-body session since it always
 *  requests 'full'. */
export const FOCUS_EMOJI: Record<Focus, string> = {
  full: '🏋️',
  upper: '💪',
  abs: '🔥',
  legs: '🦵',
  cardio: '🏃',
};
export const QUICK_EMOJI = '⏱️';
export const TRAVEL_EMOJI = '✈️';

/** Options offered by the day-marker sheet, in the order they're listed. `emoji` is '' for
 *  'none', which the sheet renders as a blank untrained square rather than a symbol. */
export const DAY_MARKER_OPTIONS: { marker: DayMarker; label: string; emoji: string }[] = [
  { marker: 'none', label: 'No workout', emoji: '' },
  { marker: 'travel', label: 'Travel day', emoji: TRAVEL_EMOJI },
  { marker: 'quick', label: 'Quick workout', emoji: QUICK_EMOJI },
  { marker: 'full', label: 'Full-body workout', emoji: FOCUS_EMOJI.full },
  { marker: 'upper', label: 'Upper-body workout', emoji: FOCUS_EMOJI.upper },
  { marker: 'abs', label: 'Abs workout', emoji: FOCUS_EMOJI.abs },
  { marker: 'legs', label: 'Legs workout', emoji: FOCUS_EMOJI.legs },
  { marker: 'cardio', label: 'Cardio workout', emoji: FOCUS_EMOJI.cardio },
];

/** The glyph for a marker, or '' for an untrained day. */
export function markerEmoji(marker: DayMarker): string {
  if (marker === 'none') return '';
  if (marker === 'travel') return TRAVEL_EMOJI;
  if (marker === 'quick') return QUICK_EMOJI;
  return FOCUS_EMOJI[marker];
}

/** The accent a marker tints its cell with (resolve via `useTheme().colors[tone]`), or null for an
 *  untrained day. Mirrors the theme's `focus` / `dayMarker` semantic maps by name. */
export function markerTone(marker: DayMarker): AccentName | null {
  if (marker === 'none') return null;
  if (marker === 'travel') return 'sky';
  if (marker === 'quick') return 'gold';
  return FOCUS_TONE[marker];
}

/** Spoken label for a day cell. */
export function markerLabel(marker: DayMarker): string {
  return DAY_MARKER_OPTIONS.find((o) => o.marker === marker)?.label ?? 'No workout';
}
