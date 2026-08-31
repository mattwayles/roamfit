/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  globalTeardown: '<rootDir>/jest.globalTeardown.js',
  // NOTE on parallelism: several test files exercise the REAL on-device op-sqlite driver
  // (app/src/db) deliberately (see STATUS-4-loop.md — this is what caught the node:fs Metro bug
  // and a real feedback-clear bug a mock never would have). An earlier version of this config set
  // `maxWorkers: 1` because those files all opened one FIXED filename and raced on it — but that
  // only serialized files within one Jest *process*; it did nothing for two separate `npm run
  // check` invocations (two agents, or a human plus CI) racing on the same file, which hung
  // indefinitely rather than failing. The real fix is in `app/src/db/index.ts`: under Jest
  // (`process.env.JEST_WORKER_ID` set), `getDb()` now derives a unique db filename per
  // process/worker/file, so there is no shared file left to race on, in-process or across
  // processes. `maxWorkers` is intentionally left at its default (parallel) — it's no longer
  // needed for correctness and there's no reason to pay for serial execution.
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
