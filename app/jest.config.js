/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  // More than one test file now exercises the REAL on-device op-sqlite driver (app/src/db) —
  // deliberately, per HomeScreen.test.tsx's/WorkoutScreen.resume.test.tsx's own doc comments,
  // since that's what makes them catch bugs a mock never would (see STATUS-4-loop.md). But that
  // means they all share one physical `roamfit.sqlite` file on disk, the same way the real app
  // would across launches. Jest's default parallel workers run test FILES in separate processes,
  // which can race on that shared file (one file's cleanup-then-create can interleave with
  // another's). maxWorkers: 1 makes the suite deterministic; it's small enough that this costs
  // nothing meaningful in wall-clock time.
  maxWorkers: 1,
  // jest-expo's own default omits @op-engineering/op-sqlite (app/src/db/'s native driver,
  // ADR 0003/0004) — its published `node/dist` build ships ESM, which plain CommonJS `require`
  // (Jest's default transform target) can't load untranspiled. Widen the preset's own pattern
  // (see its `transformIgnorePatterns` in node_modules/jest-expo/jest-preset.js) rather than
  // replace it, so this stays in sync with whatever else jest-expo already excludes.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@op-engineering/op-sqlite))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
