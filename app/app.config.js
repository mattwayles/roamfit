/**
 * Dynamic layer over `app.json`. Expo reads the static `app.json` first and hands it to this
 * function as `config`. Nothing depends on the environment now, so it passes `config` through.
 */
module.exports = ({ config }) => config;
