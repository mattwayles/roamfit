/**
 * Global Jest manual mock for `react-native-svg`. Why: probing the real package under Jest found
 * it doesn't throw at import or initial render, but its `Svg` element's `StyleSheet` access in a
 * layout-effect fires a `require` after Jest tears down the module registry — the exact same
 * failure class documented for `expo-notifications` in `app/__mocks__/expo-notifications.js`
 * (issue #14), just triggered by a different package. Rather than chase it through the real
 * library's effect timing, replace `SvgXml` with a plain `View` stand-in — this file (like the
 * webview mock beside it) proves DemoMedia's *selection and callback* logic, not that a real SVG
 * actually rasterizes. See STATUS-6b-media-ladder.md.
 */
const React = require('react');
const { View } = require('react-native');

function SvgXml(props) {
  return React.createElement(View, { testID: props.testID ?? 'mock-svg-figure' });
}

module.exports = { SvgXml };
