/**
 * Regression for the "asked for 30 minutes, screen said 105" report.
 *
 * The engine's §5.6 contract is that a generated session lands within ±10% of the requested
 * target, and `timefit/fitSession.ts` enforces that by summing each entry's `estimatedSec`. The
 * approval screen must therefore agree with that same sum — anything else means the number the
 * user reads is not the session the engine built.
 *
 * The old formula (`sets * (estimatedSec + restSec)`) double-counted: `estimatedSec` already is
 * `sets × (work + rest) + setup`. This test pins the display to the engine's own budget, so the
 * two can never silently drift apart again.
 */
import { estimateMinutes } from './ApprovalScreen';
import type { SessionRecord } from '@roamfit/store';

/** Entries shaped like a real 30-minute session: estimatedSec is the COMPLETE per-entry cost. */
const entries = [
  { sets: 3, estimatedSec: 330, restSec: 60 },
  { sets: 3, estimatedSec: 330, restSec: 60 },
  { sets: 3, estimatedSec: 300, restSec: 45 },
  { sets: 2, estimatedSec: 240, restSec: 45 },
  { sets: 2, estimatedSec: 210, restSec: 30 },
  { sets: 1, estimatedSec: 180, restSec: 0 },
].map((e, i) => ({ ...e, id: `e${i}`, entryStatus: 'planned' }));

const session = { entries } as unknown as SessionRecord;

it('sums estimatedSec directly — the same field the engine budgets against', () => {
  // 330+330+300+240+210+180 = 1590s = 26.5 -> 27 min. Within ±10% of a 30-minute request.
  expect(estimateMinutes(session)).toBe(27);
});

it('never re-multiplies by sets or re-adds rest (the 2.8x inflation bug)', () => {
  const inflated = entries.reduce((s, e) => s + e.sets * (e.estimatedSec + e.restSec), 0) / 60;
  expect(inflated).toBeGreaterThan(60); // the old formula really did produce ~70+ min here
  expect(estimateMinutes(session)).toBeLessThan(inflated / 2);
});

it('excludes entries removed at approval', () => {
  const withRemoved = {
    entries: [
      ...entries,
      { id: 'x', sets: 3, estimatedSec: 600, restSec: 60, entryStatus: 'removed_at_approval' },
    ],
  } as unknown as SessionRecord;
  expect(estimateMinutes(withRemoved)).toBe(27);
});
