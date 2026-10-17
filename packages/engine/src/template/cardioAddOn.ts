/**
 * Track 19 — the Cardio add-on: a few single-set cardio (`conditioning`) exercises woven through a strength
 * session so the heart rate comes up between lifting blocks. Pure helpers only; `pipeline.ts`
 * does the selection and prescription through the same machinery the Cardio focus uses.
 */
import type { TemplateSlot } from './focusTemplate';

/** How many single-set cardio bursts a session of this length gets: roughly one per 10 minutes,
 *  at least two (so there is something to space), at most six. Each runs ~1 minute (one
 *  `CARDIO_INTERVAL_TABLE` interval), so the add-on stays a small slice of the session. */
export function cardioAddOnCount(targetMinutes: number): number {
  return Math.min(6, Math.max(2, Math.round(targetMinutes / 10)));
}

export function cardioAddOnSlots(count: number): TemplateSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `cardio.addon.${i}`,
    patterns: ['conditioning'] as TemplateSlot['patterns'],
    required: false,
  }));
}

/**
 * Spread `cardio` through `strength` so the gaps between cardio blocks are as even as possible,
 * never leading or trailing the list (cardio *between* lifting, not bookending it). With 5
 * strength and 2 cardio: S C S S C S S. Order within each list is preserved. With no strength
 * entries at all the cardio is simply returned as-is.
 */
export function interleaveEvenly<T>(strength: readonly T[], cardio: readonly T[]): T[] {
  if (cardio.length === 0) return [...strength];
  if (strength.length === 0) return [...cardio];
  const n = strength.length;
  const k = cardio.length;
  // Cardio `j` (0-based) follows the first `floor((j + 1) * n / (k + 1))` strength entries, but
  // never fewer than one, so it never leads the session.
  const followsCount = cardio.map((_, j) => Math.max(1, Math.floor(((j + 1) * n) / (k + 1))));
  const out: T[] = [];
  strength.forEach((s, i) => {
    out.push(s);
    cardio.forEach((c, j) => {
      if (followsCount[j] === i + 1) out.push(c);
    });
  });
  return out;
}
