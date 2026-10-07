/**
 * The "Recommended Focus" card on Generate, just under the "What are we training?" header. Drives
 * the real store: a fresh install has no strength data, so it recommends Full body; after one
 * completed session it names the lightest area (any selectable focus group).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import GenerateScreen from './GenerateScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function CompleteOneSession({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString());
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('recommended-focus-test')),
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
  const session = sessionsRepo.getSession(db, sessionId)!;
  for (const entry of session.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i += 1) {
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
        utcInstant,
      );
    }
  }
  completeSession(
    db,
    { sessionId, library: exerciseLibrary, families: familyLibrary },
    nowUtcInstant(),
  );
  return <>{children}</>;
}

function screenEl() {
  return (
    <GenerateScreen
      navigation={
        { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() } as never
      }
      route={{ key: 'Generate', name: 'Generate', params: undefined } as never}
    />
  );
}

describe('Generate: Recommended Focus card', () => {
  it('recommends full body on a fresh install, then names a selectable focus after a session', async () => {
    const first = await render(<StoreProvider>{screenEl()}</StoreProvider>);
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);
    const fresh = screen.getByTestId('focus-muscle');
    expect(within(fresh).getByText('Full body')).toBeTruthy();
    await first.unmount();

    await render(
      <StoreProvider>
        <CompleteOneSession>{screenEl()}</CompleteOneSession>
      </StoreProvider>,
    );
    const card = await waitFor(() => screen.getByTestId('focus-muscle'), WAIT_OPTS);
    expect(within(card).getByText('Recommended Focus')).toBeTruthy();
    expect(within(card).getByText(/^(Upper|Core|Legs|Cardio Only)$/)).toBeTruthy();

    // The matching focus tile starts selected, and only that one.
    const label = within(card).getByText(/^(Upper|Core|Legs|Cardio Only)$/).props.children;
    const selected = screen
      .getAllByRole('radio')
      .filter((n) => n.props.accessibilityState?.selected);
    expect(selected.map((n) => n.props.accessibilityLabel)).toContain(label);
    const focusTiles = within(screen.getByTestId('focus-picker')).getAllByRole('radio');
    expect(focusTiles.filter((n) => n.props.accessibilityState?.selected)).toHaveLength(1);
  });
});
