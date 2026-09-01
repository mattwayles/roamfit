/**
 * Global Jest manual mock for `react-native-webview` (Jest convention: a file at
 * `<rootDir>/__mocks__/<package>.js` replaces that package for every test automatically).
 *
 * Why this exists: the real package throws at *import* time under Jest — confirmed by direct
 * probing — `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'RNCWebViewModule'
 * could not be found`, because there is no native module registered. This is the same class of
 * Jest-vs-device gap `expo-audio` hits (see workoutAudio.ts's header) except the real package
 * doesn't degrade gracefully on its own — anything that imports it (including transitively, via
 * `DemoMedia.tsx` -> `WorkoutScreen.tsx`) makes every test in the suite fail to even load. A
 * plain `View` stand-in that forwards every prop lets `DemoMedia.test.tsx` render the component
 * tree and drive `onError`/`onHttpError` directly as normal props, and lets every *other* test
 * file that transitively imports `WorkoutScreen.tsx` keep working exactly as before this track.
 *
 * This mock proves nothing about real YouTube IFrame embedding, real player errors, or real
 * audio-session interaction — see STATUS-6b-media-ladder.md for what remains device-only.
 */
const React = require('react');
const { View } = require('react-native');

function WebView(props) {
  return React.createElement(View, { testID: props.testID ?? 'mock-webview', ...props });
}

module.exports = { WebView };
