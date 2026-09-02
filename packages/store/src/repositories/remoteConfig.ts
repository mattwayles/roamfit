/**
 * §11.4 / §4.1 remote-config local mirror — `video/{exercise_id}` as last pulled from Firestore.
 * Read-only from the app's perspective (an operator, via `video_db.py`/track 6e, is the only
 * writer on the Firestore side); `sync/firestoreSyncWorker.ts` is the only writer of this table
 * locally, applying whatever the delta pull returns.
 *
 * `getCuratedVideoId` is the seam that closes issue #29/#30: 6b's `WorkoutScreen.tsx` hard-coded
 * `curatedVideoId={null}` at its `DemoMedia` call site specifically waiting for this. This is a
 * synchronous local SQLite read — no network on the call path, consistent with invariant 1.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

export interface RemoteVideoConfigRow {
  exerciseId: string;
  videoId: string | null;
  videoVerifiedAt: string | null;
  videoFlagCount: number;
  updatedAt: string;
}

/** Null curated id (never bundled, invariant 8) is the correct default for anything not yet
 *  synced — the media ladder already treats null as "no curated embed, cues only." */
export function getCuratedVideoId(db: Db, exerciseId: string): string | null {
  const row = db
    .select({ videoId: schema.remoteVideoConfig.videoId })
    .from(schema.remoteVideoConfig)
    .where(eq(schema.remoteVideoConfig.exerciseId, exerciseId))
    .get();
  return row?.videoId ?? null;
}

export function getRemoteVideoConfig(db: Db, exerciseId: string): RemoteVideoConfigRow | null {
  const row = db
    .select()
    .from(schema.remoteVideoConfig)
    .where(eq(schema.remoteVideoConfig.exerciseId, exerciseId))
    .get();
  return row ?? null;
}

/** Upserts one row as pulled from Firestore's `video/{exercise_id}` doc. Pull-only: this table
 *  is never the source a local write flows *from* — `updatedAt` here is the remote document's
 *  own `updated_at`, not a locally-generated timestamp. */
export function applyRemoteVideoConfig(db: Db, row: RemoteVideoConfigRow): void {
  const existing = db
    .select()
    .from(schema.remoteVideoConfig)
    .where(eq(schema.remoteVideoConfig.exerciseId, row.exerciseId))
    .get();
  if (existing) {
    db.update(schema.remoteVideoConfig)
      .set({
        videoId: row.videoId,
        videoVerifiedAt: row.videoVerifiedAt,
        videoFlagCount: row.videoFlagCount,
        updatedAt: row.updatedAt,
      })
      .where(eq(schema.remoteVideoConfig.exerciseId, row.exerciseId))
      .run();
  } else {
    db.insert(schema.remoteVideoConfig).values(row).run();
  }
}
