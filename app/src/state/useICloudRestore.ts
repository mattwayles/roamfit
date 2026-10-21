import { useCallback, useState } from 'react';
import { downloadAndRestore } from '../lib/icloudBackup';
import type { DownloadRestoreResult } from '../lib/icloudBackup';
import { useStore } from './StoreContext';

/** Calm, never-alarming copy for a restore that did not happen; null when it did. */
export function restoreOutcomeMessage(result: DownloadRestoreResult): string | null {
  switch (result.kind) {
    case 'restored':
      return null;
    case 'newer':
      return 'This backup was made by a newer version of Wanderlift. Update the app to restore it.';
    case 'none':
      return 'No backup found in iCloud.';
    case 'unavailable':
      return "iCloud isn't available on this phone right now.";
    case 'download-failed':
    case 'invalid':
    case 'failed':
      return "Couldn't restore just now. Nothing on this phone changed.";
  }
}

// Shared by every caller: a restore swaps the live database file, so two must never overlap.
let restoreInFlight = false;

/**
 * Track 43 — "Restore my data" / "Restore from iCloud backup". Downloads the latest backup and
 * swaps it in, then hands the new `Db` to `StoreProvider` (restored: remount the app on it; rolled
 * back: just the new handle, since the old one was closed). `message` is the calm outcome copy
 * for anything that did not restore. Starting a second restore while one runs does nothing.
 */
export function useICloudRestore(): {
  restoring: boolean;
  message: string | null;
  restore: () => Promise<void>;
} {
  const { replaceDb } = useStore();
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const restore = useCallback(async () => {
    if (restoreInFlight) return;
    restoreInFlight = true;
    setRestoring(true);
    setMessage(null);
    try {
      const result = await downloadAndRestore();
      if (result.kind === 'restored') {
        replaceDb(result.db, { remount: true });
        return;
      }
      if (result.kind === 'failed') replaceDb(result.db);
      setMessage(restoreOutcomeMessage(result));
    } finally {
      restoreInFlight = false;
      setRestoring(false);
    }
  }, [replaceDb]);

  return { restoring, message, restore };
}
