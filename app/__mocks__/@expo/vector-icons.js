// The real icon sets load their font asynchronously and setState afterwards, which logs "not
// wrapped in act(...)" noise in every test that renders an icon. Render a plain host <Text>
// instead; the glyph name is kept as a `name` prop so tests can query it
// (`UNSAFE_getByProps({ name: 'flash' })`) or read `getByTestId(...).props.name`.
const React = require('react');
const { Text } = require('react-native');

function makeIconSet(displayName) {
  const Icon = ({ name, size, color, style, ...rest }) =>
    React.createElement(Text, { ...rest, name, style: [{ fontSize: size, color }, style] });
  Icon.displayName = displayName;
  return Icon;
}

module.exports = {
  Ionicons: makeIconSet('Ionicons'),
  FontAwesome: makeIconSet('FontAwesome'),
  createIconSet: () => makeIconSet('Icon'),
};
