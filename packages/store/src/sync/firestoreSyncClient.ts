/**
 * §11.3 — the seam `app/` implements against a real Firestore + Auth SDK. `packages/store` never
 * imports the Firebase SDK itself (same discipline as `llmQueueWorker.ts`'s `LlmProxyCaller`):
 * this package only ever sees a plain async interface, so it stays testable in node with zero
 * network and the real Firebase wiring lives entirely in `app/`.
 *
 * Firestore is a **sync target only, never a read dependency** (CLAUDE.md invariant, §11.3) —
 * nothing in `packages/store`'s core loop (generate/approve/run/complete/log/dashboard) calls
 * any of these methods. `firestoreSyncWorker.ts`'s functions are called opportunistically by
 * `app/` (foreground, connectivity-restored), the same calling convention `processLlmQueue`
 * already established.
 */

export interface RemoteVersionedDoc<T> {
  data: T;
  /** The remote document's own `updated_at`, ISO 8601 — compared against the local row's
   *  `updated_at` by `resolveLastWriteWins`. */
  updatedAt: string;
}

export interface RemoteVideoConfigEntry {
  exerciseId: string;
  videoId: string | null;
  videoVerifiedAt: string | null;
  videoFlagCount: number;
  updatedAt: string;
}

export interface FirestoreSyncClient {
  /** Read one document's current state, or `null` if it doesn't exist remotely yet. `collection`
   *  is a logical name (`'exercise_state'` | `'rolled_up_stats'`), not a literal Firestore path —
   *  the app-side implementation owns the real path (e.g. scoping under the signed-in user). */
  pullDoc<T>(
    collection: 'exercise_state' | 'rolled_up_stats',
    id: string,
  ): Promise<RemoteVersionedDoc<T> | null>;

  /** Write one document, last-write-wins already decided by the caller. */
  pushDoc<T>(
    collection: 'exercise_state' | 'rolled_up_stats' | 'sessions',
    id: string,
    data: T,
    updatedAt: string,
  ): Promise<void>;

  /** Delta pull of `video/{exercise_id}` — every entry whose remote `updated_at` is after
   *  `sinceUpdatedAt` (`null` = full pull, first sync). Read-only from the app's side; an
   *  operator (video_db.py, track 6e) is the only writer. */
  pullVideoConfigDelta(sinceUpdatedAt: string | null): Promise<RemoteVideoConfigEntry[]>;
}
