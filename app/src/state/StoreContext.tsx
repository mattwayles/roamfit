/**
 * The one place a screen gets its `Db` handle, the exercise library, and the family library.
 * Screens never construct these themselves and never import `@op-engineering/op-sqlite` or
 * `packages/data`'s raw JSON directly — everything domain-shaped comes from this context, and
 * every mutation goes through a `@roamfit/store` repository function, never a query written
 * here (CLAUDE.md: no business logic, no new persistence logic, in `app/`).
 */
import React, { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import type { Db } from '@roamfit/store';
import { getDb } from '../db';

export interface StoreContextValue {
  db: Db;
  library: ExerciseLibrary;
  families: FamilyLibrary;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: PropsWithChildren): React.JSX.Element {
  const value = useMemo<StoreContextValue>(
    () => ({
      db: getDb(),
      library: exerciseLibrary,
      families: familyLibrary,
    }),
    [],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore() called outside <StoreProvider>');
  return ctx;
}
