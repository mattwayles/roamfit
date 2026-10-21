import { useEffect } from 'react';
import { AppState } from 'react-native';
import { runBackup } from '../lib/icloudBackup';
import { useStore } from './StoreContext';

/**
 * Track 43 — backs up to iCloud whenever the app moves to the background (throttled to once per
 * 15 minutes inside `runBackup`). Mount it once, under `StoreProvider`. Fire-and-forget: `runBackup`
 * never throws and nothing waits on it.
 */
export function useBackupOnBackground(): void {
  const { db } = useStore();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') void runBackup(db, { reason: 'background' });
    });
    return () => subscription.remove();
  }, [db]);
}
