/**
 * §11.3 deferred work queues — LLM distillation, HealthKit write, passport geocode. Enqueued at
 * completion (§10.9), never awaited: completion must succeed with zero connectivity (§11.1).
 * Workers that drain these are Wave 6's job; this wave only writes them durably.
 */
import { eq } from 'drizzle-orm';
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

export function getPendingDeferredWork(db: Db): DeferredWorkRecord[] {
  return db
    .select()
    .from(schema.deferredWork)
    .where(eq(schema.deferredWork.status, 'pending'))
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      sessionId: row.sessionId,
      payload: JSON.parse(row.payload),
      status: row.status,
      attempts: row.attempts,
    }));
}
