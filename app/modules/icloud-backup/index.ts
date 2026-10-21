import ICloudBackupNative from './src/ICloudBackupModule';

/**
 * iCloud container backup (Track 43). One opaque file goes in and out of the app's hidden iCloud
 * container; this module knows nothing about SQLite. The container keeps two copies: the latest
 * upload and the one before it.
 */

/** Which stored copy to act on. */
export type BackupWhich = 'latest' | 'previous';

export interface BackupStat {
  /** Last-modified time of the stored copy, in milliseconds since the epoch. */
  modifiedAt: number;
  /** Size of the stored copy in bytes. */
  size: number;
}

/**
 * True when the user is signed in to iCloud and this app's container resolves. False (never a
 * rejection) otherwise, so callers can treat "no iCloud" as a quiet no-op.
 */
export function isAvailable(): Promise<boolean> {
  return ICloudBackupNative.isAvailable();
}

/**
 * Copies the file at `localPath` (plain path or `file://` URL) into the container as the latest
 * backup, first rotating the existing latest to `previous`. The copy is staged and swapped in, so
 * a partial write never sits at the latest slot. Rejects with a coded error on failure.
 */
export function upload(localPath: string): Promise<void> {
  return ICloudBackupNative.upload(localPath);
}

/**
 * Copies a stored backup to `toPath` (plain path or `file://` URL), overwriting. Resolves false if
 * there is no such backup. If iCloud has evicted the file this waits for it to download and
 * rejects with `ERR_DOWNLOAD_TIMEOUT` after about 60 seconds.
 */
export function download(toPath: string, which: BackupWhich = 'latest'): Promise<boolean> {
  return ICloudBackupNative.download(toPath, which);
}

/** Metadata of a stored backup (works before it is downloaded), or null if there is none. */
export function stat(which: BackupWhich = 'latest'): Promise<BackupStat | null> {
  return ICloudBackupNative.stat(which);
}
