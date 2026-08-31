/**
 * Global Jest manual mock for `expo-notifications`, automatically used in every test file in
 * this workspace (Jest's convention: a file at `<rootDir>/__mocks__/<node_modules package>.js`
 * replaces that package for every test, no `jest.mock()` call needed at each call site).
 *
 * Why this exists (issue #14, re-diagnosed): the real package's own `index.ts` has a top-level
 * side effect — `DevicePushTokenAutoRegistration.fx.ts` calls `addPushTokenListener` at *import*
 * time, starting a background async registration chain we never asked for and don't control.
 * Under real CPU contention (two concurrent `npx jest` runs in this workspace, confirmed by the
 * orchestrator: 2-5 failures every run, `ReferenceError: You are trying to 'require' a file
 * after the Jest environment has been torn down`), that chain can still be in flight when Jest
 * tears down a test file's module registry, and its continuation's next module resolution throws
 * exactly that error. It is triggered purely by **importing** the real package — nothing in this
 * app's own code (WorkoutScreen/workoutNotifications/workoutAudio) leaves work running past
 * unmount; every effect that starts async work here already clears its interval/cancels its own
 * ref-write on cleanup. This mock removes the uncontrolled chain at its source rather than
 * chasing it through cancellation tokens on code that isn't the one leaking.
 *
 * Mirrors exactly the surface `app/src/lib/workoutNotifications.ts` calls (and its own,
 * per-file `jest.mock()` — unaffected by this; a local mock still overrides this global one).
 * Every function is a no-op / resolves immediately, matching what the *real* package already
 * does under Jest for actual calls (confirmed by probing it directly, see workoutNotifications.ts's
 * header) — this mock only removes the import-time side effect, not the calls' own behavior.
 */
function setNotificationHandler() {}

async function getPermissionsAsync() {
  return { status: 'undetermined' };
}

async function requestPermissionsAsync() {
  return { status: 'undetermined' };
}

async function scheduleNotificationAsync() {
  return 'mock-notification-id';
}

async function cancelScheduledNotificationAsync() {}

const SchedulableTriggerInputTypes = {
  TIME_INTERVAL: 'timeInterval',
  DATE: 'date',
  CALENDAR: 'calendar',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

module.exports = {
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  SchedulableTriggerInputTypes,
};
