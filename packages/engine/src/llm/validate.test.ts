import {
  validateIntakeOutput,
  validateCoachVoiceOutput,
  validateDistillationOutput,
} from './validate';

describe('§7.3 "validate anyway" — LLM output validation', () => {
  describe('validateIntakeOutput', () => {
    const good = { focus: 'upper', effort: 'normal', targetMinutes: 25 };

    it('accepts a well-formed structured intake result', () => {
      expect(validateIntakeOutput(good).valid).toBe(true);
    });

    it('rejects an invalid focus enum value', () => {
      const result = validateIntakeOutput({ ...good, focus: 'cardio' });
      expect(result.valid).toBe(false);
      expect(result.errors.join()).toMatch(/focus/);
    });

    it('rejects an invalid effort enum value', () => {
      const result = validateIntakeOutput({ ...good, effort: 'brutal' });
      expect(result.valid).toBe(false);
    });

    it('rejects a targetMinutes below the ADR-0002 15-minute floor', () => {
      const result = validateIntakeOutput({ ...good, targetMinutes: 7 });
      expect(result.valid).toBe(false);
      expect(result.errors.join()).toMatch(/targetMinutes/);
    });

    it('rejects a hallucinated absurd targetMinutes', () => {
      const result = validateIntakeOutput({ ...good, targetMinutes: 600 });
      expect(result.valid).toBe(false);
    });

    it('rejects an invalid equipmentPreference', () => {
      const result = validateIntakeOutput({ ...good, equipmentPreference: 'kettlebell' });
      expect(result.valid).toBe(false);
    });

    it('rejects an invalid suggestedLimitationTag', () => {
      const result = validateIntakeOutput({ ...good, suggestedLimitationTag: 'made_up_tag' });
      expect(result.valid).toBe(false);
    });

    it('accepts a legitimate suggestedLimitationTag', () => {
      const result = validateIntakeOutput({ ...good, suggestedLimitationTag: 'shoulder_overhead' });
      expect(result.valid).toBe(true);
    });

    // This is the test that proves invariant 2 structurally, not just by convention: if a
    // response somehow smuggles a selection field (a hand-rolled JSON parse bypassing the tool
    // schema, or a future refactor that loosens the type), validation must catch it rather than
    // silently passing it through to the pipeline. Fails if this rejection is ever removed.
    it('rejects intake output that smuggles an exercise selection field', () => {
      const result = validateIntakeOutput({ ...good, exerciseId: 'bw-push-up' } as never);
      expect(result.valid).toBe(false);
      expect(result.errors.join()).toMatch(/exerciseId/);
    });

    it('rejects intake output that smuggles a band/load field', () => {
      const result = validateIntakeOutput({ ...good, band: 'B3' } as never);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateCoachVoiceOutput', () => {
    const sessionIds = ['bw-push-up', 'band-row'];

    it('accepts a plain rewritten explanation with no cue expansion', () => {
      const result = validateCoachVoiceOutput(
        { rewrittenExplanation: 'Nice work today.' },
        sessionIds,
      );
      expect(result.valid).toBe(true);
    });

    it('rejects an empty rewritten explanation', () => {
      const result = validateCoachVoiceOutput({ rewrittenExplanation: '' }, sessionIds);
      expect(result.valid).toBe(false);
    });

    it('rejects a pathologically long explanation', () => {
      const result = validateCoachVoiceOutput(
        { rewrittenExplanation: 'x'.repeat(1000) },
        sessionIds,
      );
      expect(result.valid).toBe(false);
    });

    it('accepts a cue expansion naming an exercise that is actually in the session', () => {
      const result = validateCoachVoiceOutput(
        {
          rewrittenExplanation: 'Nice work.',
          expandedCueExerciseId: 'bw-push-up',
          expandedCueText: 'Hands under shoulders, brace your core.',
        },
        sessionIds,
      );
      expect(result.valid).toBe(true);
    });

    // Fails if the "must be in this session" check is removed — proves the model cannot name an
    // exercise it was never shown, which matters because a coach-voice job's prompt should only
    // ever include this session's own exercises in the first place (a defense-in-depth check).
    it('rejects a cue expansion naming an exercise NOT in the session', () => {
      const result = validateCoachVoiceOutput(
        {
          rewrittenExplanation: 'Nice work.',
          expandedCueExerciseId: 'some-other-exercise-not-in-session',
          expandedCueText: 'irrelevant',
        },
        sessionIds,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join()).toMatch(/not one of this session/);
    });
  });

  describe('validateDistillationOutput', () => {
    const sessionIds = ['bw-push-up', 'band-row'];

    it('accepts an empty distillation result', () => {
      expect(validateDistillationOutput({}, sessionIds).valid).toBe(true);
    });

    it('accepts a valid suspected limitation tag', () => {
      const result = validateDistillationOutput(
        { suspectedLimitationTag: 'knee_impact' },
        sessionIds,
      );
      expect(result.valid).toBe(true);
    });

    it('rejects an invalid suspected limitation tag', () => {
      const result = validateDistillationOutput(
        { suspectedLimitationTag: 'not_a_real_tag' },
        sessionIds,
      );
      expect(result.valid).toBe(false);
    });

    it('accepts band-too-light ids that are in the session', () => {
      const result = validateDistillationOutput(
        { bandTooLightExerciseIds: ['band-row'] },
        sessionIds,
      );
      expect(result.valid).toBe(true);
    });

    // This is the core prompt-injection-resistance test: even if the model was steered by
    // adversarial retrospective text into naming an exercise the user never did, the validator
    // must reject it rather than let it flow into a signal event. Fails if the containment check
    // is ever dropped.
    it("rejects an exercise id that is not one of this session's own entries", () => {
      const result = validateDistillationOutput(
        { aversionExerciseIds: ['bw-burpee-not-in-this-session'] },
        sessionIds,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join()).toMatch(/not one of this session/);
    });

    it('rejects a non-array where an array is required', () => {
      const result = validateDistillationOutput(
        { aversionExerciseIds: 'bw-push-up' as unknown },
        sessionIds,
      );
      expect(result.valid).toBe(false);
    });
  });
});
