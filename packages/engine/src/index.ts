/**
 * @roamfit/engine — pure TypeScript generation + progression engine.
 *
 * Invariant (CLAUDE.md #2, wave-01a-skeleton brief): this package must never import from
 * `app/` or from `react-native`. It has no I/O and no network calls, so it is fully
 * unit-testable in plain node. Enforced by `tools/check-engine-purity.js`.
 *
 * §5.1: a pure function from (library, user state, request) to a session plan.
 */
export * from './types';
export { createRng, seedFromString } from './rng';
export { daysBetween, addDays } from './dates';
export { ENGINE_VERSION } from './version';
// The pipeline entry point (`generateSession`) is exported once all seven §5.1 stages land;
// see docs/handoff/STATUS-2-engine.md for progress. Individual stage modules are already
// importable directly (e.g. './filters/hardFilters', './template/focusTemplate') and tested
// in isolation as they land.
