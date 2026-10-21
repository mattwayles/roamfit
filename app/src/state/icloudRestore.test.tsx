/**
 * Track 43d — the restore UI end to end: the welcome-step offer on a fresh install, Settings →
 * Advanced, the outcome copy, and the provider swapping to the restored database. Real store and
 * real files; only the native iCloud module is the Jest fake. The fake keeps opaque strings, so a
 * "download" is staged by hand: a real snapshot taken earlier is copied into the incoming slot,
 * the way the native module would deliver it.
 */
import React from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { open } from '@op-engineering/op-sqlite';
import { usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from './StoreContext';
import { ThemeProvider } from './ThemeProvider';
import { useBackupOnBackground } from './useBackupOnBackground';
import { restoreOutcomeMessage, useICloudRestore } from './useICloudRestore';
import { LIVE_DB_NAME, __resetDbInstanceForTesting, closeDb, getDb } from '../db';
import { RESTORE_INCOMING_NAME, createSnapshot } from '../db/backup';
import { copyVerified, deleteDb, readAppliedIds, scratchNames } from '../db/backupFiles';
import * as icloudBackup from '../lib/icloudBackup';
import { nowUtcInstant } from '../lib/localClock';
import ICloudMock from '../../modules/icloud-backup/src/ICloudBackupModule';
import { midnightTheme } from '../theme';
import { WAIT, ready } from '../ui/test-utils';

const mock = ICloudMock as unknown as {
  __reset(): void;
  __setAvailable(a: boolean): void;
  __setStored(w: 'latest' | 'previous', b: string | null, at?: number): void;
};

const names = scratchNames(LIVE_DB_NAME);
const NOW = nowUtcInstant();
const BACKUP_AT = new Date(2026, 9, 12, 18, 30).getTime();

/** Writes a real snapshot of an onboarded db (units kg) and leaves the live db empty again. */
function makeDonorSnapshot(): void {
  const db = getDb();
  usersRepo.ensureUser(db, NOW);
  usersRepo.finishOnboarding(db, NOW);
  usersRepo.updateUser(db, { units: 'kg' }, NOW);
  createSnapshot();
  closeDb();
  deleteDb(LIVE_DB_NAME);
  __resetDbInstanceForTesting();
}

/** The backup in iCloud: `download` delivers the donor snapshot to the incoming slot. */
function publishBackup(): void {
  mock.__setStored('latest', 'backup', BACKUP_AT);
  jest.spyOn(ICloudMock, 'download').mockImplementation(async () => {
    const src = open({ name: names.outgoing });
    copyVerified(src, RESTORE_INCOMING_NAME, readAppliedIds(names.outgoing)!);
    src.close();
    return true;
  });
}

/** A phone already in use: onboarded, its own data (units lb), never reconciled with iCloud. */
function onboardedPhone(): void {
  const db = getDb();
  usersRepo.ensureUser(db, NOW);
  usersRepo.finishOnboarding(db, NOW);
  usersRepo.updateUser(db, { units: 'lb' }, NOW);
}

async function launch() {
  await render(
    <StoreProvider>
      <ThemeProvider>
        <NavigationContainer theme={midnightTheme.navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </ThemeProvider>
    </StoreProvider>,
  );
}

async function openAdvanced() {
  await ready('open-settings');
  await fireEvent.press(screen.getByTestId('open-settings'));
  await ready('settings-screen');
  await fireEvent.press(screen.getByTestId('settings-advanced-toggle'));
}

const user = () => usersRepo.getUser(getDb())!;

beforeEach(() => {
  mock.__reset();
  icloudBackup.__resetBackupSchedulerForTesting();
  makeDonorSnapshot();
});

afterEach(() => {
  jest.restoreAllMocks();
  closeDb();
  for (const n of Object.values(names)) deleteDb(n);
  deleteDb(LIVE_DB_NAME);
  __resetDbInstanceForTesting();
});

describe('welcome-step offer', () => {
  it('renders the welcome step with no offer when iCloud holds no backup', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    await launch();
    await ready('disclaimer-gate');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByTestId('restore-offer')).toBeNull();
    expect(user().backupDecisionPending).toBe(false);
  });

  it('does not offer a backup to a phone that is already linked', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    usersRepo.updateUser(getDb(), { icloudBackupLinked: true }, NOW);
    publishBackup();
    await launch();
    await ready('disclaimer-gate');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByTestId('restore-offer')).toBeNull();
  });

  it('never blocks the welcome step while iCloud is slow, then offers calmly', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    let release!: () => void;
    jest.spyOn(icloudBackup, 'checkForExistingBackup').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ modifiedAt: BACKUP_AT, size: 10 });
        }),
    );
    await launch();
    await ready('disclaimer-acknowledge');
    expect(screen.queryByTestId('restore-offer')).toBeNull();
    await act(async () => release());
    await ready('restore-offer');
  });

  it('offers the backup, with its date, to an unlinked fresh install', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    await launch();
    await ready('restore-offer');
    expect(
      screen.getByText(/Welcome back — there.s a Wanderlift backup in your iCloud from/),
    ).toBeTruthy();
    expect(screen.getByText(/Oct 12 at 6:30 PM/)).toBeTruthy();
    expect(user().backupDecisionPending).toBe(true);
    expect(screen.getByText('Restore my data')).toBeTruthy();
    expect(screen.getByText('Start fresh')).toBeTruthy();
  });

  it('Start fresh explains the consequence first, then keeps this phone', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    await launch();
    await ready('restore-offer');
    await fireEvent.press(screen.getByTestId('restore-offer-fresh'));
    await ready('keep-phone-sheet');
    expect(user().icloudBackupLinked).toBe(false); // nothing committed yet
    expect(
      screen.getByText('Your iCloud backup will be replaced the next time Wanderlift backs up.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('keep-phone-confirm'));
    await waitFor(() => expect(screen.queryByTestId('restore-offer')).toBeNull(), WAIT);
    expect(user().icloudBackupLinked).toBe(true);
    expect(user().backupDecisionPending).toBe(false);
  });

  it('declining the confirm keeps the offer and the pending decision', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    await launch();
    await ready('restore-offer');
    await fireEvent.press(screen.getByTestId('restore-offer-fresh'));
    await ready('keep-phone-sheet');
    await fireEvent.press(screen.getByTestId('keep-phone-cancel'));
    expect(user().icloudBackupLinked).toBe(false);
    expect(user().backupDecisionPending).toBe(true);
    expect(screen.getByTestId('restore-offer')).toBeTruthy();
  });

  it('Restore my data lands on Today with the restored data and no onboarding', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    await launch();
    await ready('restore-offer');
    const before = getDb();
    await fireEvent.press(screen.getByTestId('restore-offer-restore'));
    await ready('today-screen');
    expect(screen.queryByTestId('disclaimer-gate')).toBeNull();
    expect(screen.queryByTestId('onboarding-screen')).toBeNull();
    expect(getDb()).not.toBe(before);
    expect(user().units).toBe('kg');
    expect(user().icloudBackupLinked).toBe(true);
    expect(user().backupDecisionPending).toBe(false);
    await ready('restored-banner');
    expect(screen.getByText('Welcome back. Your data is restored.')).toBeTruthy();
  });

  it('says so calmly when the backup is gone, and changes nothing', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    await launch();
    await ready('restore-offer');
    jest.spyOn(ICloudMock, 'download').mockResolvedValue(false);
    await fireEvent.press(screen.getByTestId('restore-offer-restore'));
    await waitFor(
      () =>
        expect(screen.getByTestId('restore-message')).toHaveTextContent(
          'No backup found in iCloud.',
        ),
      WAIT,
    );
    expect(screen.getByTestId('disclaimer-gate')).toBeTruthy();
  });

  it('does not start a second restore while one is running', async () => {
    usersRepo.ensureUser(getDb(), NOW);
    publishBackup();
    await launch();
    await ready('restore-offer');
    let finish!: (r: icloudBackup.DownloadRestoreResult) => void;
    const spy = jest
      .spyOn(icloudBackup, 'downloadAndRestore')
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await fireEvent.press(screen.getByTestId('restore-offer-restore'));
    await waitFor(() => expect(screen.getByText('Restoring…')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByTestId('restore-offer-restore'));
    await fireEvent.press(screen.getByTestId('restore-offer-fresh'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('keep-phone-sheet')).toBeNull();
    await act(async () => finish({ kind: 'none' }));
    await waitFor(() => expect(screen.getByText('Restore my data')).toBeTruthy(), WAIT);
  });
});

describe('Settings', () => {
  beforeEach(() => onboardedPhone());

  it('shows the restore row only when a backup exists, with its date', async () => {
    await launch();
    await openAdvanced();
    await ready('load-diagnostics');
    expect(screen.queryByTestId('restore-icloud')).toBeNull();
  });

  it('hides the restore row when iCloud is unavailable', async () => {
    publishBackup();
    mock.__setAvailable(false);
    await launch();
    await openAdvanced();
    await ready('load-diagnostics');
    expect(screen.queryByTestId('restore-icloud')).toBeNull();
  });

  it('confirms, then restores and remounts on the restored data', async () => {
    publishBackup();
    await launch();
    await openAdvanced();
    await ready('restore-icloud');
    expect(screen.getByTestId('restore-icloud-value')).toHaveTextContent('Oct 12 at 6:30 PM');
    await fireEvent.press(screen.getByTestId('restore-icloud'));
    await ready('restore-sheet');
    expect(screen.getByText('Restore from iCloud?')).toBeTruthy();
    expect(
      screen.getByText(
        /This replaces the data on this phone with your backup from Oct 12 at 6:30 PM\./,
      ),
    ).toBeTruthy();
    expect(user().units).toBe('lb');
    await fireEvent.press(screen.getByTestId('restore-confirm-yes'));
    await ready('today-screen');
    expect(user().units).toBe('kg');
    expect(screen.getByText('Welcome back. Your data is restored.')).toBeTruthy();
  });

  it('keeping this phone in the confirm restores nothing', async () => {
    publishBackup();
    await launch();
    await openAdvanced();
    await ready('restore-icloud');
    await fireEvent.press(screen.getByTestId('restore-icloud'));
    await ready('restore-sheet');
    await fireEvent.press(screen.getByTestId('restore-confirm-cancel'));
    expect(user().units).toBe('lb');
    expect(screen.getByTestId('settings-screen')).toBeTruthy();
  });

  it('a backup from a failed download leaves the phone alone and says so calmly', async () => {
    publishBackup();
    await launch();
    await openAdvanced();
    await ready('restore-icloud');
    jest.spyOn(ICloudMock, 'download').mockRejectedValue(new Error('offline'));
    await fireEvent.press(screen.getByTestId('restore-icloud'));
    await ready('restore-sheet');
    await fireEvent.press(screen.getByTestId('restore-confirm-yes'));
    await waitFor(
      () =>
        expect(screen.getByTestId('restore-message')).toHaveTextContent(
          "Couldn't restore just now. Nothing on this phone changed.",
        ),
      WAIT,
    );
    expect(user().units).toBe('lb');
  });

  it('offers "Keep this phone\'s data" while a decision is pending, with the consequence', async () => {
    publishBackup();
    usersRepo.updateUser(getDb(), { backupDecisionPending: true }, NOW);
    await launch();
    await ready('open-settings');
    await fireEvent.press(screen.getByTestId('open-settings'));
    await ready('keep-this-phone');
    expect(
      screen.getByText(/Restore it from Advanced below, or keep this phone's data here\./),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('keep-this-phone'));
    await ready('keep-phone-sheet');
    expect(
      screen.getByText('Your iCloud backup will be replaced the next time Wanderlift backs up.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('keep-phone-confirm'));
    await waitFor(() => expect(screen.queryByTestId('keep-this-phone')).toBeNull(), WAIT);
    expect(user().icloudBackupLinked).toBe(true);
    expect(user().backupDecisionPending).toBe(false);
  });
});

describe('after a restore', () => {
  it('a background backup uses the restored db, not the closed one', async () => {
    onboardedPhone();
    publishBackup();
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      fn: (s: string) => void,
    ) => {
      listeners.push(fn);
      return { remove: () => listeners.splice(listeners.indexOf(fn), 1) };
    }) as never);
    const run = jest.spyOn(icloudBackup, 'runBackup').mockResolvedValue({ kind: 'failed' });

    function Probe() {
      useBackupOnBackground();
      const { restore } = useICloudRestore();
      return (
        <Pressable testID="probe-restore" onPress={() => void restore()}>
          <Text>restore</Text>
        </Pressable>
      );
    }
    const old = getDb();
    await render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    await ready('probe-restore');
    await fireEvent.press(screen.getByTestId('probe-restore'));
    await waitFor(() => expect(getDb()).not.toBe(old), WAIT);
    await waitFor(() => expect(listeners.length).toBe(1), WAIT);
    act(() => listeners[0]('background'));
    expect(run).toHaveBeenLastCalledWith(getDb(), { reason: 'background' });
    expect(run).not.toHaveBeenCalledWith(old, expect.anything());
  });
});

describe('restoreOutcomeMessage', () => {
  it('has calm copy for every outcome that did not restore', () => {
    const db = {} as never;
    expect(restoreOutcomeMessage({ kind: 'restored', db })).toBeNull();
    expect(restoreOutcomeMessage({ kind: 'newer', unknownIds: ['x'] })).toBe(
      'This backup was made by a newer version of Wanderlift. Update the app to restore it.',
    );
    expect(restoreOutcomeMessage({ kind: 'none' })).toBe('No backup found in iCloud.');
    expect(restoreOutcomeMessage({ kind: 'unavailable' })).toBe(
      "iCloud isn't available on this phone right now.",
    );
    const couldnt = "Couldn't restore just now. Nothing on this phone changed.";
    expect(restoreOutcomeMessage({ kind: 'download-failed' })).toBe(couldnt);
    expect(restoreOutcomeMessage({ kind: 'invalid' })).toBe(couldnt);
    expect(restoreOutcomeMessage({ kind: 'failed', error: 'x', db })).toBe(couldnt);
  });
});
