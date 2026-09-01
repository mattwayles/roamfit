/**
 * §11.3 — "resolve per-document last-write-wins on a monotonic `updated_at`." Pure, no I/O:
 * `firestoreSyncWorker.ts` is the only caller, and it's the one place that actually reads/writes
 * a document. Kept separate and pure specifically so the conflict-resolution rule itself is
 * trivially unit-testable in isolation from any network or DB mock.
 */
export interface Versioned {
  updatedAt: string;
}

export type LwwSource = 'local' | 'remote';

export interface LwwResult<T> {
  winner: T;
  source: LwwSource;
}

/**
 * `remote === null` means no remote document exists yet (first sync) — local always wins in
 * that case, since there is nothing to compare against. Otherwise the later `updated_at` wins;
 * an exact tie is resolved in favor of local (the device doing the comparison right now has
 * already seen its own write — nothing is lost by keeping it, whereas discarding it in favor of
 * an identically-timestamped remote value would be an arbitrary, unobservable choice).
 */
export function resolveLastWriteWins<T extends Versioned>(
  local: T,
  remote: T | null,
): LwwResult<T> {
  if (remote === null) return { winner: local, source: 'local' };
  const localMs = Date.parse(local.updatedAt);
  const remoteMs = Date.parse(remote.updatedAt);
  return remoteMs > localMs
    ? { winner: remote, source: 'remote' }
    : { winner: local, source: 'local' };
}
