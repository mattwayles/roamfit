/**
 * Shared setup for the §10.5 timed-exercise interaction tests
 * (`WorkoutScreen.timedBilateral.test.tsx` / `WorkoutScreen.timedUnilateral.test.tsx`) — split
 * into two files rather than two `it`s in one so each real-timer-heavy test gets its own Jest
 * module registry (and so its own `getDb()` instance) and runs without any shared-process timing
 * pressure from the other. `mockNavigation` isn't here (it needs `jest.fn()`, and this file's
 * name deliberately doesn't match the `*.test.ts` glob eslint scopes jest globals to) — it's
 * duplicated in each test file instead, which is fine at three lines.
 */
import { eq } from 'drizzle-orm';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, schema, sessionsRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

/** Logs every set of every active entry up to (not including) `stopBeforeEntryId` as completed. */
export function fastForwardTo(
  db: Db,
  session: sessionsRepo.SessionRecord,
  stopBeforeEntryId: string,
) {
  for (const entry of session.entries) {
    if (entry.id === stopBeforeEntryId) return;
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i++) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        nowUtcInstant(),
      );
    }
  }
}

/** Builds a fresh pending, started session and forces its first active main entry into a short,
 *  controlled timed entry (single set) — the *shape* the store persists is real (real schema,
 *  real driver), only the specific duration/laterality are controlled so a test doesn't have to
 *  wait out whatever duration the generator happened to pick. */
export async function setUpTimedEntry(
  db: Db,
  seed: string,
  opts: { durationSec: number; unilateral: boolean },
): Promise<{ sessionId: string; entryId: string }> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString(seed)),
    utcInstant,
  });
  const sessionId = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });

  const session = sessionsRepo.getSession(db, sessionId)!;
  const firstMain = session.entries.find(
    (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
  )!;

  db.update(schema.sessionEntries)
    .set({
      durationSec: opts.durationSec,
      repTarget: null,
      unilateral: opts.unilateral,
      sets: 1,
    })
    .where(eq(schema.sessionEntries.id, firstMain.id))
    .run();

  // `findCurrent()` (WorkoutScreen.tsx) walks the plan in order — warmup first, then main, then
  // cooldown — so anything before `firstMain` (all of warmup, plus any earlier main entry) has to
  // be logged as done, or the screen would land there instead of on the entry under test.
  fastForwardTo(db, session, firstMain.id);

  sessionsRepo.startSession(db, sessionId, nowUtcInstant());
  return { sessionId, entryId: firstMain.id };
}
