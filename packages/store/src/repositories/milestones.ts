/** §9.7 / §6.7 / §9.9 milestones — celebrated the same way, logged as an accumulating record. */
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';

export type MilestoneType = (typeof schema.milestones.$inferInsert)['type'];

export interface AddMilestoneInput {
  type: MilestoneType;
  payload: Record<string, unknown>;
  sessionId?: string | null;
  localDate: string;
}

export function addMilestone(db: Db, input: AddMilestoneInput, now: string): void {
  db.insert(schema.milestones)
    .values({
      id: newId(),
      userId: 'local',
      type: input.type,
      payload: JSON.stringify(input.payload),
      sessionId: input.sessionId ?? null,
      localDate: input.localDate,
      createdAt: now,
    })
    .run();
}

export interface MilestoneRecord {
  id: string;
  type: MilestoneType;
  payload: Record<string, unknown>;
  sessionId: string | null;
  localDate: string;
}

export function getMilestonesForSession(db: Db, sessionId: string): MilestoneRecord[] {
  return db
    .select()
    .from(schema.milestones)
    .where(eq(schema.milestones.sessionId, sessionId))
    .all()
    .map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      sessionId: row.sessionId,
      localDate: row.localDate,
    }));
}

export function getAllMilestones(db: Db): MilestoneRecord[] {
  return db
    .select()
    .from(schema.milestones)
    .all()
    .map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      sessionId: row.sessionId,
      localDate: row.localDate,
    }));
}
