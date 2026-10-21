/**
 * The one place a screen gets its `Db` handle, the exercise library, and the family library.
 * Screens never construct these themselves and never import `@op-engineering/op-sqlite` or
 * `packages/data`'s raw JSON directly — everything domain-shaped comes from this context, and
 * every mutation goes through a `@roamfit/store` repository function, never a query written
 * here (CLAUDE.md: no business logic, no new persistence logic, in `app/`).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import type { Db } from '@roamfit/store';
import { getDb } from '../db';

export interface StoreContextValue {
  db: Db;
  library: ExerciseLibrary;
  families: FamilyLibrary;
  /** Swaps in the `Db` that an iCloud restore returned (the old handle is closed). With
   *  `remount` the whole app subtree is rebuilt on it, so every screen re-reads and navigation
   *  returns to Today; without it only the handle changes (a restore that rolled back). */
  replaceDb: (db: Db, opts?: { remount?: boolean }) => void;
  /** True from a successful restore until Today has shown "Welcome back" once. */
  restoredNotice: boolean;
  clearRestoredNotice: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [db, setDb] = useState<Db>(() => getDb());
  // Bumped on a restore: the key rebuilds everything below (screens, navigation, effects) so
  // nothing keeps state read from, or a handle to, the replaced database.
  const [generation, setGeneration] = useState(0);
  const [restoredNotice, setRestoredNotice] = useState(false);

  const replaceDb = useCallback((next: Db, opts?: { remount?: boolean }) => {
    setDb(next);
    if (opts?.remount) {
      setRestoredNotice(true);
      setGeneration((g) => g + 1);
    }
  }, []);
  const clearRestoredNotice = useCallback(() => setRestoredNotice(false), []);

  const value = useMemo<StoreContextValue>(
    () => ({
      db,
      library: exerciseLibrary,
      families: familyLibrary,
      replaceDb,
      restoredNotice,
      clearRestoredNotice,
    }),
    [db, replaceDb, restoredNotice, clearRestoredNotice],
  );
  return (
    <StoreContext.Provider value={value}>
      <React.Fragment key={generation}>{children}</React.Fragment>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore() called outside <StoreProvider>');
  return ctx;
}
