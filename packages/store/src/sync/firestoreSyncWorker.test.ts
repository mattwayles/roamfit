import { createTestDb } from '../testHarness';
import * as exerciseStateRepo from '../repositories/exerciseState';
import * as statsRepo from '../repositories/stats';
import {
  createPendingSession,
  getPendingSession,
  logSet,
  startSession,
} from '../repositories/sessions';
import { completeSession } from '../completion';
import { generate } from '../generation';
import { library, families, clockFor, rngFor, utcInstantFor } from '../testFixtures';
import { getCuratedVideoId } from '../repositories/remoteConfig';
import { runFirestoreSync } from './firestoreSyncWorker';
import type {
  FirestoreSyncClient,
  RemoteVersionedDoc,
  RemoteVideoConfigEntry,
} from './firestoreSyncClient';
import { getExerciseStateSyncRow, getSessionsToPush } from './syncRows';

const T0 = '2026-09-01T10:00:00.000Z';

/** Generates, runs, and completes one full session — the same shape `completion.test.ts` uses —
 *  so the sessions-push test exercises a real completed session, not a hand-built row. */
function completeARealSession(db: ReturnType<typeof createTestDb>['db'], localDate: string) {
  const clock = clockFor(localDate);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library,
    families,
    request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: rngFor(1),
    utcInstant: utcInstantFor(localDate),
  });
  const sessionId = createPendingSession(db, {
    plan,
    utcInstant: utcInstantFor(localDate),
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  startSession(db, sessionId, utcInstantFor(localDate, 9));
  const session = getPendingSession(db)!;
  for (const entry of session.entries) {
    for (let i = 0; i < entry.sets; i++) {
      logSet(
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
          restTakenSec: entry.restSec,
        },
        utcInstantFor(localDate, 9, i * 2),
      );
    }
  }
  completeSession(db, { sessionId, library, families }, utcInstantFor(localDate, 10));
  return sessionId;
}

/** A simple in-memory fake standing in for a real Firestore client — proves the worker's own
 *  logic (LWW decision, error isolation, cursor advancement), not a real Firestore SDK, which
 *  this environment has no credentials or emulator to exercise. */
function makeFakeClient(overrides: Partial<FirestoreSyncClient> = {}): FirestoreSyncClient {
  const docs = new Map<string, RemoteVersionedDoc<unknown>>();
  const pushed: { collection: string; id: string; data: unknown }[] = [];
  const client: FirestoreSyncClient = {
    pullDoc: (async (collection: string, id: string) =>
      docs.get(`${collection}/${id}`) ?? null) as FirestoreSyncClient['pullDoc'],
    pushDoc: async (collection, id, data, updatedAt) => {
      docs.set(`${collection}/${id}`, { data, updatedAt });
      pushed.push({ collection, id, data });
    },
    pullVideoConfigDelta: async () => [],
    ...overrides,
  };
  (client as unknown as { __docs: typeof docs; __pushed: typeof pushed }).__docs = docs;
  (client as unknown as { __docs: typeof docs; __pushed: typeof pushed }).__pushed = pushed;
  return client;
}

describe('§11.3 Firestore sync — exercise_state (LWW)', () => {
  it('pushes local when there is no remote document yet', async () => {
    const { db } = createTestDb();
    exerciseStateRepo.recordDifficultyFeedback(db, 'bw-plank', 'too_hard', T0);
    const client = makeFakeClient();

    const result = await runFirestoreSync(db, client);
    expect(result.exerciseStatePushed).toBe(1);
    expect(result.exerciseStatePulled).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('a strictly newer remote document overwrites the local row (remote wins)', async () => {
    const { db } = createTestDb();
    exerciseStateRepo.recordDifficultyFeedback(db, 'bw-plank', 'too_hard', T0);
    const local = getExerciseStateSyncRow(db, 'bw-plank')!;
    const later = '2026-09-01T12:00:00.000Z';
    const remoteRow = { ...local, pinnedNote: 'from another device', updatedAt: later };
    const client = makeFakeClient({
      pullDoc: (async () => ({
        data: remoteRow,
        updatedAt: later,
      })) as FirestoreSyncClient['pullDoc'],
    });

    const result = await runFirestoreSync(db, client);
    expect(result.exerciseStatePulled).toBe(1);
    expect(result.exerciseStatePushed).toBe(0);
    expect(getExerciseStateSyncRow(db, 'bw-plank')!.pinnedNote).toBe('from another device');
  });

  it('an older remote document does NOT overwrite the newer local row (local wins)', async () => {
    const { db } = createTestDb();
    exerciseStateRepo.recordDifficultyFeedback(db, 'bw-plank', 'too_hard', T0);
    const local = getExerciseStateSyncRow(db, 'bw-plank')!;
    const earlier = '2026-08-01T00:00:00.000Z';
    const staleRemote = { ...local, pinnedNote: 'stale from a week ago', updatedAt: earlier };
    const client = makeFakeClient({
      pullDoc: (async () => ({
        data: staleRemote,
        updatedAt: earlier,
      })) as FirestoreSyncClient['pullDoc'],
    });

    await runFirestoreSync(db, client);
    // Local's real pinnedNote (never set) must survive — the stale remote value must not land.
    expect(getExerciseStateSyncRow(db, 'bw-plank')!.pinnedNote).toBeNull();
  });

  it('syncs the local video_flag_count/video_demoted_at — closes issue #30 (reachable by an operator once deployed)', async () => {
    const { db } = createTestDb();
    exerciseStateRepo.reportVideoIssue(db, 'bw-plank', 'user_report', T0, '2026-09-01');
    exerciseStateRepo.reportVideoIssue(db, 'bw-plank', 'user_report', T0, '2026-09-01');
    const client = makeFakeClient();
    await runFirestoreSync(db, client);
    const docs = (client as unknown as { __docs: Map<string, RemoteVersionedDoc<unknown>> }).__docs;
    const pushedRow = docs.get('exercise_state/bw-plank')!.data as { videoFlagCount: number };
    expect(pushedRow.videoFlagCount).toBe(2);
  });
});

describe('§11.3 Firestore sync — rolled_up_stats (LWW singleton)', () => {
  it('is skipped (not pushed) when no stats row exists yet (zero-session cold start)', async () => {
    const { db } = createTestDb();
    const client = makeFakeClient();
    const result = await runFirestoreSync(db, client);
    expect(result.rolledUpStats).toBe('skipped');
  });

  it('pushes when local has no remote counterpart', async () => {
    const { db } = createTestDb();
    statsRepo.ensureStats(db, T0);
    const client = makeFakeClient();
    const result = await runFirestoreSync(db, client);
    expect(result.rolledUpStats).toBe('pushed');
  });
});

describe('§11.3 Firestore sync — sessions (append-only, watermark push)', () => {
  it('a pending (not yet completed) session is never pushed', () => {
    const { db } = createTestDb();
    const clock = clockFor('2026-09-01');
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library,
      families,
      request: { focus: 'upper', effort: 'normal', targetMinutes: 30 },
      clock,
      rng: rngFor(1),
      utcInstant: utcInstantFor('2026-09-01'),
    });
    createPendingSession(db, {
      plan,
      utcInstant: utcInstantFor('2026-09-01'),
      localDate: '2026-09-01',
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    expect(getSessionsToPush(db, null)).toHaveLength(0);
  });

  it('pushes a completed session once and does not re-push it on a second pass', async () => {
    const { db } = createTestDb();
    const sessionId = completeARealSession(db, '2026-09-01');
    const client = makeFakeClient();

    const first = await runFirestoreSync(db, client);
    expect(first.sessionsPushed).toBe(1);
    const pushedIds = (
      client as unknown as { __pushed: { collection: string; id: string }[] }
    ).__pushed
      .filter((p) => p.collection === 'sessions')
      .map((p) => p.id);
    expect(pushedIds).toEqual([sessionId]);

    const second = await runFirestoreSync(db, client);
    expect(second.sessionsPushed).toBe(0);
  });

  it('a second, later-completed session is pushed on the next pass without re-pushing the first', async () => {
    const { db } = createTestDb();
    completeARealSession(db, '2026-09-01');
    const client = makeFakeClient();
    await runFirestoreSync(db, client);

    completeARealSession(db, '2026-09-02');
    const result = await runFirestoreSync(db, client);
    expect(result.sessionsPushed).toBe(1);
  });
});

describe('§11.3 Firestore sync — video/{exercise_id} remote config delta pull', () => {
  it('applies pulled entries into the local mirror and advances the cursor', async () => {
    const { db } = createTestDb();
    const entries: RemoteVideoConfigEntry[] = [
      {
        exerciseId: 'bw-plank',
        videoId: 'abc123XYZ_9',
        videoVerifiedAt: '2026-08-01T00:00:00.000Z',
        videoFlagCount: 0,
        updatedAt: '2026-08-15T00:00:00.000Z',
      },
    ];
    let calls = 0;
    const client = makeFakeClient({
      pullVideoConfigDelta: async () => {
        calls++;
        return calls === 1 ? entries : [];
      },
    });

    const result = await runFirestoreSync(db, client);
    expect(result.videoConfigApplied).toBe(1);
    expect(getCuratedVideoId(db, 'bw-plank')).toBe('abc123XYZ_9');
  });
});

describe('§11.3 Firestore sync — offline / failure isolation (must never block anything)', () => {
  it('a client that throws for every method still returns normally, never throws to the caller', async () => {
    const { db } = createTestDb();
    exerciseStateRepo.recordDifficultyFeedback(db, 'bw-plank', 'too_hard', T0);
    statsRepo.ensureStats(db, T0);
    const client: FirestoreSyncClient = {
      pullDoc: async () => {
        throw new Error('offline');
      },
      pushDoc: async () => {
        throw new Error('offline');
      },
      pullVideoConfigDelta: async () => {
        throw new Error('offline');
      },
    };

    const result = await runFirestoreSync(db, client);
    expect(result.failures.sort()).toEqual(['exercise_state', 'rolled_up_stats', 'video_config']);
    // Local data must be completely untouched — a failed sync pass is a pure no-op locally.
    expect(getExerciseStateSyncRow(db, 'bw-plank')!.difficultyEma).not.toBe(0);
  });

  it('one failing entity does not stop the others from syncing in the same pass', async () => {
    const { db } = createTestDb();
    exerciseStateRepo.recordDifficultyFeedback(db, 'bw-plank', 'too_hard', T0);
    statsRepo.ensureStats(db, T0);
    const client = makeFakeClient({
      pullDoc: async (collection) => {
        if (collection === 'exercise_state') throw new Error('offline for this one collection');
        return null;
      },
    });

    const result = await runFirestoreSync(db, client);
    expect(result.failures).toEqual(['exercise_state']);
    expect(result.rolledUpStats).toBe('pushed');
  });
});
