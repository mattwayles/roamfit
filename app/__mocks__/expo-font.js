/* global jest */
// Fonts never load under Jest (no native asset pipeline). Keep the real module — vector-icons and
// others call into it — but make `useFonts` report "loaded" so App renders its tree.
const actual = jest.requireActual('expo-font');

module.exports = {
  ...actual,
  useFonts: () => [true, null],
};
