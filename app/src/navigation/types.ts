export type RootStackParamList = {
  Home: undefined;
  /** §9.9 — an accepted Recovery Week auto-suggestion (or the manual toggle) pre-fills Generate's
   *  toggle; still requires the user to tap Generate, never applied silently. */
  Generate: { recoveryWeek?: boolean } | undefined;
  Approval: { sessionId: string };
  Workout: { sessionId: string };
  Summary: { sessionId: string };
  Settings: undefined;
  /** The exercise library, browsable — read-only apart from assigning a demo video. */
  Exercises: undefined;
  /** Reached from the library list. Keyed by the stable library id, never a list index, so the
   *  route survives the list being re-sorted or re-filtered underneath it. */
  ExerciseDetail: { exerciseId: string };
};
