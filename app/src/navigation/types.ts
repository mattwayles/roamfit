import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SessionPosition } from '../lib/sessionProgress';

/**
 * Bottom-tab routes (DESIGN.md §4). Route names stay `Home` / `Exercises` (they read as "Today" /
 * "Field Guide" only in the tab bar's labels — see `TabBar.tsx`).
 */
export type TabParamList = {
  Home: undefined;
  /** The long-term story: lifetime totals, Trails (progression), Logbook, Passport, balance. */
  Journey: undefined;
  /** The exercise library, browsable — read-only apart from assigning a demo video. */
  Exercises: undefined;
};

export type RootStackParamList = {
  /** The tab shell. Flow screens (Generate -> Approval -> Workout -> Summary) sit above it,
   *  full-screen with no tab bar. Reach a tab with `navigate('Tabs', { screen: 'Home' })`. */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** §9.9 — an accepted Recovery Week auto-suggestion (or the manual toggle) pre-fills Generate's
   *  toggle; still requires the user to tap Generate, never applied silently. */
  Generate: { recoveryWeek?: boolean } | undefined;
  Approval: { sessionId: string };
  /** `reviewFromSummary` — arriving back from Summary before FINISH, to look at or fix something
   *  in an already-fully-logged session. See WorkoutScreen's review-mode handling.
   *  `jumpTo` — arriving from a tap on a specific set in Summary's live or pre-FINISH view;
   *  lands on that exact (entry, set) bookmark instead of the front edge or the last set. */
  Workout: { sessionId: string; reviewFromSummary?: boolean; jumpTo?: SessionPosition };
  Summary: { sessionId: string };
  Settings: undefined;
  /** Reached from the library list. Keyed by the stable library id, never a list index, so the
   *  route survives the list being re-sorted or re-filtered underneath it. */
  ExerciseDetail: { exerciseId: string };
  /** A finished workout, read-only: what was done, set by set. Reached from the Logbook day sheet. */
  SessionHistory: { sessionId: string };
};

/** Props for a screen registered on the root stack: `RootScreenProps<'Workout'>`. */
export type RootScreenProps<S extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  S
>;

/**
 * Props for a screen registered on the tab navigator. Composite, so a tab screen can still
 * `navigate('Generate')` / `navigate('Settings')` on the root stack with full type checking:
 * `TabScreenProps<'Home'>`.
 */
export type TabScreenProps<S extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, S>,
  NativeStackScreenProps<RootStackParamList>
>;
