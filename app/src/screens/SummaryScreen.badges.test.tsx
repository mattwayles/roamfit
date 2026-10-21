/**
 * Earned badges on the completion screen (Track 38d), through the real SummaryScreen and store.
 * `completeSession` is wrapped so a test can declare which badge ids the session "earned" (their
 * rows are written for real, retroactive or not); the first test uses the real award path.
 */
import * as icloudBackup from '../lib/icloudBackup';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, getBadge, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { badgesRepo, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { AccessibilityInfo, Share } from 'react-native';

type Override = { ids: string[]; retroactive?: string[] } | null;
let mockOverride: Override = null;
jest.mock('@roamfit/store', () => {
  const actual = jest.requireActual('@roamfit/store');
  return {
    ...actual,
    completeSession: (...args: Parameters<typeof actual.completeSession>) => {
      const result = actual.completeSession(...args);
      if (!mockOverride) return result;
      const [db, input] = args as [never, { sessionId: string }];
      const rows = [...mockOverride.ids, ...(mockOverride.retroactive ?? [])].map((badgeId) => ({
        badgeId,
        localDate: '2026-10-01',
        sessionId: (mockOverride?.retroactive ?? []).includes(badgeId) ? null : input.sessionId,
        retroactive: (mockOverride?.retroactive ?? []).includes(badgeId),
      }));
      actual.badgesRepo.insertEarnedBadges(db, rows, '2026-10-01T12:00:00.000Z');
      return { ...result, newBadgeIds: [...mockOverride.ids, ...(mockOverride.retroactive ?? [])] };
    },
  };
});

jest.setTimeout(30000);
const EVENTUALLY = { timeout: 12000, interval: 50 };
const HIDDEN = { includeHiddenElements: true };

type Db = ReturnType<typeof useStore>['db'];

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

const navigate = jest.fn();

async function finishASession(beforeFinish?: (db: Db) => void) {
  let db!: Db;
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), EVENTUALLY);
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  usersRepo.ensureUser(db, utcInstant);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'legs', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('summary-badges-seed')),
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
  sessionsRepo.startSession(db, sessionId, utcInstant);
  for (const e of sessionsRepo.getSession(db, sessionId)!.entries) {
    if (e.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < e.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: e.id,
          setIndex: i,
          status: 'completed',
          repsActual: e.repTarget ?? undefined,
          secondsActual: e.durationSec ?? undefined,
          restPrescribedSec: e.restSec,
        },
        utcInstant,
      );
    }
  }
  render(
    <StoreProvider>
      <NavigationContainer>
        <SummaryScreen
          navigation={
            {
              navigate,
              replace: jest.fn(),
              reset: jest.fn(),
              goBack: jest.fn(),
              setOptions: jest.fn(),
            } as never
          }
          route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
        />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), EVENTUALLY);
  beforeFinish?.(db);
  fireEvent.press(screen.getByTestId('finish-button'));
  await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), EVENTUALLY);
  return { db, sessionId };
}

describe('badges on the completion screen', () => {
  beforeEach(() => {
    mockOverride = null;
    navigate.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  const seen = (db: Db, id: string) =>
    badgesRepo.getEarnedBadges(db).find((r) => r.badgeId === id)?.seenAt ?? null;

  it('a first workout earns First Steps for real: a card with the eyebrow, name, description; share sends the text; it is marked seen', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { db } = await finishASession();
    await waitFor(() => expect(screen.getByTestId('badge-0')).toBeTruthy(), EVENTUALLY);
    expect(screen.getByText('BADGE EARNED')).toBeTruthy();
    expect(screen.getByText('First Steps')).toBeTruthy();
    await waitFor(() => expect(seen(db, 'sessions_1')).not.toBeNull(), EVENTUALLY);
    fireEvent.press(screen.getByTestId('badge-0-share'));
    expect(share).toHaveBeenCalledWith({ message: 'Earned the First Steps badge on Wanderlift' });
  });

  it('lands up to three cards in engine order, then one "+N more badges" chip that opens Badges', async () => {
    mockOverride = {
      ids: ['sessions_1', 'sessions_5', 'minutes_60', 'level_ups_1', 'best_sets_1'],
    };
    const { db } = await finishASession();
    await waitFor(() => expect(screen.getByTestId('badges-more')).toBeTruthy(), EVENTUALLY);
    expect(screen.getByTestId('badge-0')).toBeTruthy();
    expect(screen.getByTestId('badge-1')).toBeTruthy();
    expect(screen.getByTestId('badge-2')).toBeTruthy();
    expect(screen.queryByTestId('badge-3')).toBeNull();
    const names = mockOverride.ids.slice(0, 3).map((id) => getBadge(id)!.name);
    const shown = screen.getAllByText('BADGE EARNED');
    expect(shown).toHaveLength(3);
    for (const [i, name] of names.entries()) {
      expect(within(screen.getByTestId(`badge-${i}`, HIDDEN)).getByText(name)).toBeTruthy();
    }
    expect(screen.getByText('+2 more badges')).toBeTruthy();
    // Celebrated ones are seen; the two folded into the chip are left for the Badges screen.
    expect(seen(db, 'sessions_1')).not.toBeNull();
    expect(seen(db, 'minutes_60')).not.toBeNull();
    expect(seen(db, 'level_ups_1')).toBeNull();
    expect(seen(db, 'best_sets_1')).toBeNull();
    fireEvent.press(screen.getByTestId('badges-more'));
    expect(navigate).toHaveBeenCalledWith('Badges');
  });

  it('never shows a card for a retroactive badge, and no section when nothing was earned', async () => {
    mockOverride = { ids: [], retroactive: ['summit_all'] };
    await finishASession();
    await waitFor(() => expect(screen.getByTestId('return-home')).toBeTruthy(), EVENTUALLY);
    expect(screen.queryByTestId('completion-badges')).toBeNull();
    expect(screen.queryByText('BADGE EARNED')).toBeNull();
  });

  it('a badge held from an earlier workout is not celebrated again', async () => {
    await finishASession((db) =>
      badgesRepo.insertEarnedBadges(
        db,
        [{ badgeId: 'sessions_1', localDate: '2026-09-01', sessionId: null, retroactive: false }],
        '2026-09-01T12:00:00.000Z',
      ),
    );
    await waitFor(() => expect(screen.getByTestId('return-home')).toBeTruthy(), EVENTUALLY);
    expect(screen.queryByText('First Steps')).toBeNull();
  });

  it('Reduce Motion: the card still arrives, and is there once the beat has passed', async () => {
    const reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    mockOverride = { ids: ['hard_sessions_1'] };
    await finishASession();
    const name = getBadge('hard_sessions_1')!.name;
    await waitFor(() => expect(screen.getByText(name)).toBeTruthy(), EVENTUALLY);
    expect(reduce).toHaveBeenCalled();
    expect(screen.getByTestId('badge-0-emblem')).toBeTruthy();
  });

  it('finishing a workout fires an iCloud backup in the background without blocking the screen', async () => {
    const backup = jest.spyOn(icloudBackup, 'runBackup').mockResolvedValue({ kind: 'failed' });
    const { db } = await finishASession();
    expect(backup).toHaveBeenCalledTimes(1);
    expect(backup).toHaveBeenCalledWith(db, { reason: 'session-complete' });
  });
});
