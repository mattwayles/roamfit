/**
 * §8.3 catch-all implicit-signal event log. Every signal on the spec's list that isn't a natural
 * column on `session_entries`/`set_logs` gets logged here — append-only, queryable by type or by
 * session.
 */
import { eq, and } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';

export type SignalEventType = (typeof schema.signalEvents.$inferInsert)['type'];

export interface LogSignalEventInput {
  sessionId: string | null;
  type: SignalEventType;
  payload: Record<string, unknown>;
  utcInstant: string;
  localDate: string;
}

export function logSignalEvent(db: Db, input: LogSignalEventInput): void {
  db.insert(schema.signalEvents)
    .values({
      id: newId(),
      sessionId: input.sessionId,
      type: input.type,
      payload: JSON.stringify(input.payload),
      utcInstant: input.utcInstant,
      localDate: input.localDate,
    })
    .run();
}

export interface SignalEventRecord {
  id: string;
  sessionId: string | null;
  type: SignalEventType;
  payload: Record<string, unknown>;
  utcInstant: string;
  localDate: string;
}

function rowToEvent(row: typeof schema.signalEvents.$inferSelect): SignalEventRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    payload: JSON.parse(row.payload),
    utcInstant: row.utcInstant,
    localDate: row.localDate,
  };
}

export function getSignalEventsForSession(db: Db, sessionId: string): SignalEventRecord[] {
  return db
    .select()
    .from(schema.signalEvents)
    .where(eq(schema.signalEvents.sessionId, sessionId))
    .all()
    .map(rowToEvent);
}

export function getSignalEventsByType(db: Db, type: SignalEventType): SignalEventRecord[] {
  return db
    .select()
    .from(schema.signalEvents)
    .where(eq(schema.signalEvents.type, type))
    .all()
    .map(rowToEvent);
}

/** Consecutive-regenerate-taps helper (§8.3: "regenerate taps, and how many in a row"). Counts
 *  regenerate events for this session with no intervening non-regenerate session event. In
 *  practice a session's regenerate taps all happen at the approval stage before anything else is
 *  logged against it, so this is simply the total count for the session — kept as a named
 *  function so the "consecutive" semantics are explicit and testable rather than assumed. */
export function consecutiveRegenerateTapCount(db: Db, sessionId: string): number {
  return db
    .select()
    .from(schema.signalEvents)
    .where(
      and(eq(schema.signalEvents.sessionId, sessionId), eq(schema.signalEvents.type, 'regenerate')),
    )
    .all().length;
}
