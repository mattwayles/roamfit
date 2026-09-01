/**
 * §11.3 Firestore sync worker — local-first, opportunistic, never on the critical path
 * (invariant 1: nothing in generate/approve/run/complete/log/dashboard awaits any of this).
 * `app/` calls `runFirestoreSync` on a foreground or connectivity-restored signal, exactly the
 * way it's expected to eventually call `processLlmQueue` (issue #34 — that wiring is explicitly
 * not this track's job; this worker's *own* app-side trigger is, since Firestore sync is this
 * track's scope).
 *
 * Three sync shapes, matching what §11.3 names explicitly:
 *  - `exercise_state` / `rolled_up_stats`: real conflict-prone documents (a second device could
 *    write either), resolved per-document last-write-wins on `updated_at` via
 *    `resolveLastWriteWins`. A remote win is applied back into local SQLite; a local win is
 *    pushed. This is also the path that finally gets the local `video_flag_count`/
 *    `video_demoted_at` (issue #30 — Wave 6b's local-only flag counter) somewhere an operator can
 *    reach it, once a real deployment exists.
 *  - `sessions`: append-only, single local writer, no pull-back — a plain watermark push. "Do
 *    not read full history to render the dashboard" (§11.3's Firestore cost note) already can't
 *    be violated here: this worker never *reads* sessions back, and no dashboard code in this
 *    package touches Firestore at all — the dashboard is a local SQLite read exactly as before.
 *  - `video/{exercise_id}` remote config: delta pull only, applied into
 *    `remote_video_config` (issue #29/#30's `curatedVideoId` seam).
 *
 * A client failure (thrown error — no connectivity, auth failure, quota) for any one entity is
 * caught and simply stops *that* entity's work for this pass; it never throws out of
 * `runFirestoreSync` and never blocks any other entity's sync in the same pass. There is no
 * backoff queue here (unlike the LLM queue) because this isn't a discrete job list — it's a
 * bounded reconciliation pass over a handful of tables, re-run wholesale on the next opportunity.
 */
import type { Db } from '../db';
import { getSyncCursor, setSyncCursor } from '../repositories/syncCursor';
import { applyRemoteVideoConfig } from '../repositories/remoteConfig';
import {
  applyExerciseStateSyncRow,
  applyRolledUpStatsSyncRow,
  getAllExerciseStateSyncRows,
  getRolledUpStatsSyncRow,
  getSessionsToPush,
} from './syncRows';
import { resolveLastWriteWins } from './lastWriteWins';
import type { FirestoreSyncClient } from './firestoreSyncClient';

const SESSIONS_PUSH_CURSOR = 'sessions_pushed_at';
const VIDEO_CONFIG_PULL_CURSOR = 'video_config_pulled_at';

export interface FirestoreSyncResult {
  exerciseStatePushed: number;
  exerciseStatePulled: number;
  rolledUpStats: 'pushed' | 'pulled' | 'skipped' | 'failed';
  sessionsPushed: number;
  videoConfigApplied: number;
  failures: string[];
}

async function syncExerciseState(
  db: Db,
  client: FirestoreSyncClient,
): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0;
  let pulled = 0;
  for (const local of getAllExerciseStateSyncRows(db)) {
    const remote = await client.pullDoc<typeof local>('exercise_state', local.exerciseId);
    const { winner, source } = resolveLastWriteWins(local, remote ? remote.data : null);
    if (source === 'local') {
      await client.pushDoc('exercise_state', local.exerciseId, local, local.updatedAt);
      pushed++;
    } else {
      applyExerciseStateSyncRow(db, winner);
      pulled++;
    }
  }
  return { pushed, pulled };
}

async function syncRolledUpStats(
  db: Db,
  client: FirestoreSyncClient,
): Promise<'pushed' | 'pulled' | 'skipped'> {
  const local = getRolledUpStatsSyncRow(db);
  if (!local) return 'skipped'; // no stats row yet (zero-session cold start) — nothing to sync.
  const remote = await client.pullDoc<typeof local>('rolled_up_stats', 'local');
  const { winner, source } = resolveLastWriteWins(local, remote ? remote.data : null);
  if (source === 'local') {
    await client.pushDoc('rolled_up_stats', 'local', local, local.updatedAt);
    return 'pushed';
  }
  applyRolledUpStatsSyncRow(db, winner);
  return 'pulled';
}

async function pushSessions(db: Db, client: FirestoreSyncClient): Promise<number> {
  const since = getSyncCursor(db, SESSIONS_PUSH_CURSOR);
  const toPush = getSessionsToPush(db, since);
  let pushed = 0;
  for (const session of toPush) {
    await client.pushDoc('sessions', session.id, session, session.updatedAt);
    setSyncCursor(db, SESSIONS_PUSH_CURSOR, session.updatedAt);
    pushed++;
  }
  return pushed;
}

async function pullVideoConfig(db: Db, client: FirestoreSyncClient): Promise<number> {
  const since = getSyncCursor(db, VIDEO_CONFIG_PULL_CURSOR);
  const entries = await client.pullVideoConfigDelta(since);
  let applied = 0;
  let latest = since;
  for (const entry of entries) {
    applyRemoteVideoConfig(db, entry);
    if (latest === null || entry.updatedAt > latest) latest = entry.updatedAt;
    applied++;
  }
  if (latest !== since && latest !== null) setSyncCursor(db, VIDEO_CONFIG_PULL_CURSOR, latest);
  return applied;
}

/** Runs every sync shape this track owns, isolating failures per entity so one down collection
 *  (or no connectivity at all) never blocks the others or throws to the caller. Safe to call
 *  opportunistically as often as the app likes — every step is either a bounded local read or a
 *  handful of remote document round-trips. */
export async function runFirestoreSync(
  db: Db,
  client: FirestoreSyncClient,
): Promise<FirestoreSyncResult> {
  const result: FirestoreSyncResult = {
    exerciseStatePushed: 0,
    exerciseStatePulled: 0,
    rolledUpStats: 'skipped',
    sessionsPushed: 0,
    videoConfigApplied: 0,
    failures: [],
  };

  try {
    const { pushed, pulled } = await syncExerciseState(db, client);
    result.exerciseStatePushed = pushed;
    result.exerciseStatePulled = pulled;
  } catch {
    result.failures.push('exercise_state');
  }

  try {
    result.rolledUpStats = await syncRolledUpStats(db, client);
  } catch {
    result.rolledUpStats = 'failed';
    result.failures.push('rolled_up_stats');
  }

  try {
    result.sessionsPushed = await pushSessions(db, client);
  } catch {
    result.failures.push('sessions');
  }

  try {
    result.videoConfigApplied = await pullVideoConfig(db, client);
  } catch {
    result.failures.push('video_config');
  }

  return result;
}
