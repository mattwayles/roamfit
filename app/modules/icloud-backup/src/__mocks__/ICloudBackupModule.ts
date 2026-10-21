/**
 * Jest stand-in for the native iCloud module, installed for every test by `jest.setup.js` so app
 * tests never reach native code. An in-memory fake of the same contract, including the rotation
 * of the latest copy to `previous` on upload.
 *
 * Real files on disk would need node:fs, which the Metro bundle does not allow, so the fake stores opaque string "bytes" keyed by local path instead: `upload(path)` stores
 * whatever `__setLocalFile(path, bytes)` registered for that path, and `download` hands it back
 * through `__getLocalFile(path)`. Tests seed and inspect through the `__` helpers below.
 */
import type { BackupStat, BackupWhich } from '../../index';

interface StoredCopy {
  bytes: string;
  modifiedAt: number;
}

interface FakeState {
  available: boolean;
  /** Local "filesystem": path -> contents. */
  local: Map<string, string>;
  /** The fake container. */
  stored: Record<BackupWhich, StoredCopy | null>;
  /** When set, the next call to the named function rejects with this error code, once. */
  failNext: Partial<Record<'isAvailable' | 'upload' | 'download' | 'stat', string>>;
  clock: number;
}

let state: FakeState = fresh();

function fresh(): FakeState {
  return {
    available: true,
    local: new Map(),
    stored: { latest: null, previous: null },
    failNext: {},
    clock: 1_700_000_000_000,
  };
}

function norm(path: string): string {
  return path.startsWith('file://') ? path.slice('file://'.length) : path;
}

function maybeFail(fn: keyof FakeState['failNext']): void {
  const code = state.failNext[fn];
  if (code) {
    delete state.failNext[fn];
    throw Object.assign(new Error(`ICloudBackup mock failure: ${code}`), { code });
  }
}

export default {
  async isAvailable(): Promise<boolean> {
    maybeFail('isAvailable');
    return state.available;
  },

  async upload(localPath: string): Promise<void> {
    maybeFail('upload');
    if (!state.available) {
      throw Object.assign(new Error('iCloud unavailable'), { code: 'ERR_ICLOUD_UNAVAILABLE' });
    }
    const bytes = state.local.get(norm(localPath));
    if (bytes === undefined) {
      throw Object.assign(new Error('Local snapshot not found'), { code: 'ERR_SOURCE_MISSING' });
    }
    if (state.stored.latest) state.stored.previous = state.stored.latest;
    state.clock += 1000;
    state.stored.latest = { bytes, modifiedAt: state.clock };
  },

  async download(toPath: string, which: BackupWhich = 'latest'): Promise<boolean> {
    maybeFail('download');
    if (!state.available) {
      throw Object.assign(new Error('iCloud unavailable'), { code: 'ERR_ICLOUD_UNAVAILABLE' });
    }
    const copy = state.stored[which];
    if (!copy) return false;
    state.local.set(norm(toPath), copy.bytes);
    return true;
  },

  async stat(which: BackupWhich = 'latest'): Promise<BackupStat | null> {
    maybeFail('stat');
    if (!state.available) {
      throw Object.assign(new Error('iCloud unavailable'), { code: 'ERR_ICLOUD_UNAVAILABLE' });
    }
    const copy = state.stored[which];
    return copy ? { modifiedAt: copy.modifiedAt, size: copy.bytes.length } : null;
  },

  // ---- test helpers (not part of the native contract) ----

  /** Back to a signed-in, empty container and an empty local filesystem. */
  __reset(): void {
    state = fresh();
  },
  __setAvailable(available: boolean): void {
    state.available = available;
  },
  /** Registers the contents of a local file so `upload(path)` has something to copy. */
  __setLocalFile(path: string, bytes: string): void {
    state.local.set(norm(path), bytes);
  },
  /** Contents of a local file (e.g. one written by `download`), or undefined. */
  __getLocalFile(path: string): string | undefined {
    return state.local.get(norm(path));
  },
  /** Puts a copy straight into the container, as if another device had uploaded it. */
  __setStored(which: BackupWhich, bytes: string | null, modifiedAt?: number): void {
    state.stored[which] =
      bytes === null ? null : { bytes, modifiedAt: modifiedAt ?? (state.clock += 1000) };
  },
  __getStored(which: BackupWhich): string | null {
    return state.stored[which]?.bytes ?? null;
  },
  /** Makes the next call to `fn` reject once with the given error code. */
  __failNext(fn: keyof FakeState['failNext'], code: string): void {
    state.failNext[fn] = code;
  },
};
