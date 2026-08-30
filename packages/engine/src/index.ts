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
export { generateSession, generateQuickSession } from './pipeline';
export { DEFAULT_ANCHORS_AVAILABLE } from './filters/hardFilters';
