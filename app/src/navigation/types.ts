export type RootStackParamList = {
  Home: undefined;
  /** §9.9 — an accepted Recovery Week auto-suggestion (or the manual toggle) pre-fills Generate's
   *  toggle; still requires the user to tap Generate, never applied silently. */
  Generate: { recoveryWeek?: boolean } | undefined;
  Approval: { sessionId: string };
  Workout: { sessionId: string };
  Summary: { sessionId: string };
};
