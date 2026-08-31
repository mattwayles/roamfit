/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  setupFiles: ['<rootDir>/jest.setup.js'],
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
