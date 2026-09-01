/**
 * §7.3 model tiering. Ids confirmed against the `claude-api` skill's current model table on
 * 2026-09-01 (not recalled from training) — do not change these without re-checking that table;
 * never append a date suffix.
 *
 *   claude-opus-5   — natural-language intake. Highest-stakes of the three jobs: it is the only
 *                     one whose output becomes a real `GenerationRequest` the pipeline acts on,
 *                     so it gets the most capable model even though its schema is narrow.
 *   claude-haiku-4-5 — coach voice (prose rewrite) and feedback distillation (text -> structured
 *                     signals). Both are async, non-blocking, and low-stakes if wrong (validated
 *                     anyway, one repair, deterministic fallback) — cheapest tier is the right
 *                     call per §7.3's explicit tiering.
 */
export const INTAKE_MODEL = 'claude-opus-5';
export const COACH_VOICE_MODEL = 'claude-haiku-4-5';
export const DISTILLATION_MODEL = 'claude-haiku-4-5';
