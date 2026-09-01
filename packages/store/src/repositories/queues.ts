/**
 * §11.3 deferred work queues — LLM distillation, LLM coach voice, HealthKit write, passport
 * geocode. Enqueued at completion/generation (§10.9/§7.1), never awaited: those operations must
 * succeed with zero connectivity (§11.1). This is the durable queue Wave 5 wrote; 6c-llm-proxy
 * adds the exponential-backoff eligibility fields and the drain worker for the two `llm_*` kinds
 * (`healthkit_write`/`passport_geocode` are 6d's worker to write).
 */
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';

export type DeferredWorkKind = (typeof schema.deferredWork.$inferInsert)['kind'];

export function enqueueDeferredWork(
  db: Db,
  kind: DeferredWorkKind,
  sessionId: string,
  payload: Record<string, unknown>,
  now: string,
): void {
  db.insert(schema.deferredWork)
    .values({ id: newId(), kind, sessionId, payload: JSON.stringify(payload), createdAt: now })
    .run();
}

export interface DeferredWorkRecord {
  id: string;
  kind: DeferredWorkKind;
  sessionId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'done' | 'failed';
  attempts: number;
}

function rowToRecord(row: typeof schema.deferredWork.$inferSelect): DeferredWorkRecord {
  return {
    id: row.id,
    kind: row.kind,
    sessionId: row.sessionId,
    payload: JSON.parse(row.payload),
    status: row.status,
    attempts: row.attempts,
  };
}

export function getPendingDeferredWork(db: Db): DeferredWorkRecord[] {
  return db
    .select()
    .from(schema.deferredWork)
    .where(eq(schema.deferredWork.status, 'pending'))
    .all()
    .map(rowToRecord);
}

/** Pending work that is actually eligible to run right now — `status: 'pending'` AND
 *  (`next_attempt_at` is unset, or it has already passed). This is what the §11.3 queue worker
 *  should drain; `getPendingDeferredWork` (all pending, ignoring backoff) stays for anything
 *  that wants the unfiltered view (e.g. a "how many jobs are waiting" UI count). */
export function getEligibleDeferredWork(db: Db, now: string): DeferredWorkRecord[] {
  return db
    .select()
    .from(schema.deferredWork)
    .where(
      and(
        eq(schema.deferredWork.status, 'pending'),
        or(isNull(schema.deferredWork.nextAttemptAt), lte(schema.deferredWork.nextAttemptAt, now)),
      ),
    )
    .all()
    .map(rowToRecord);
}

export function markDeferredWorkDone(db: Db, id: string, now: string): void {
  db.update(schema.deferredWork)
    .set({ status: 'done', processedAt: now })
    .where(eq(schema.deferredWork.id, id))
    .run();
}

/** §11.3 exponential backoff. `attempts` increments; below `maxAttempts` the row is rescheduled
 *  `2^attempts` minutes out (capped at `capMinutes`) and stays `pending`; at `maxAttempts` it is
 *  marked `failed` permanently. Either way this never throws and never surfaces to the user — a
 *  coach line or a distillation signal arriving late (or never) is an accepted outcome (§11.3),
 *  never a blocked workout. */
export function recordDeferredWorkFailure(
  db: Db,
  id: string,
  now: string,
  options: { maxAttempts?: number; capMinutes?: number } = {},
): void {
  const maxAttempts = options.maxAttempts ?? 6;
  const capMinutes = options.capMinutes ?? 240;
  const row = db.select().from(schema.deferredWork).where(eq(schema.deferredWork.id, id)).get();
  if (!row) return;
  const attempts = row.attempts + 1;
  if (attempts >= maxAttempts) {
    db.update(schema.deferredWork)
      .set({ attempts, status: 'failed', processedAt: now })
      .where(eq(schema.deferredWork.id, id))
      .run();
    return;
  }
  const delayMinutes = Math.min(2 ** attempts, capMinutes);
  const nextAttemptAt = new Date(new Date(now).getTime() + delayMinutes * 60_000).toISOString();
  db.update(schema.deferredWork)
    .set({ attempts, nextAttemptAt })
    .where(eq(schema.deferredWork.id, id))
    .run();
}
