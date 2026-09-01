import { COACH_VOICE_MODEL, DISTILLATION_MODEL, INTAKE_MODEL } from './models';

// Pins the §7.3 model tiering to the ids confirmed against the `claude-api` skill's current
// model table (2026-09-01) rather than a recalled literal — see the comment in `models.ts`.
// If this test ever needs to change, re-check the skill's table first; do not just update the
// literal to make the test pass.
describe('§7.3 model tiering', () => {
  it('uses claude-opus-5 for natural-language intake', () => {
    expect(INTAKE_MODEL).toBe('claude-opus-5');
  });

  it('uses claude-haiku-4-5 for coach voice and feedback distillation', () => {
    expect(COACH_VOICE_MODEL).toBe('claude-haiku-4-5');
    expect(DISTILLATION_MODEL).toBe('claude-haiku-4-5');
  });
});
