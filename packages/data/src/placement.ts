/**
 * Track 37g — placement: an optional, self-reported way to start each ladder at the right rung
 * instead of level 1. Two parts, both answered by the user, never inferred:
 *
 *  1. An experience level, which places every ladder at a share of its length.
 *  2. A few "how many can you do?" questions, each of which overrides one ladder's rung with the
 *     rung named by the answer.
 *
 * Answers name `level_id`s, never positions (invariant 5), so inserting a rung into a ladder never
 * shifts what an answer means. A user who skips placement stays on level 1 everywhere, which is
 * where the cold start has always been. Every rung is still checked against the user's equipment
 * and limitations at generation (the hard filters substitute the nearest rung that survives), so a
 * placement can never hand anyone an exercise their filters rule out.
 *
 * Deliberately conservative: each answer lands on a rung the user can already do for reps, so the
 * first sessions confirm the placement and the ordinary progression takes it from there. The "too
 * hard — level down" control is always there if a placement is still too ambitious.
 */
import type { ProgressionFamilyId } from './schema';

export type ExperienceLevel = 'new' | 'returning' | 'regular' | 'advanced';

export interface ExperienceOption {
  id: ExperienceLevel;
  label: string;
  description: string;
  /** Share of each ladder's length to start at: 0 = level 1. Rounded down to a rung. */
  ladderShare: number;
}

export const EXPERIENCE_OPTIONS: readonly ExperienceOption[] = [
  {
    id: 'new',
    label: 'New to training',
    description: 'Little or no regular exercise. Everything starts at the first level.',
    ladderShare: 0,
  },
  {
    id: 'returning',
    label: 'Getting back into it',
    description: 'Trained before, but not for a while.',
    ladderShare: 0.2,
  },
  {
    id: 'regular',
    label: 'Train regularly',
    description: 'Strength training most weeks for the past few months.',
    ladderShare: 0.35,
  },
  {
    id: 'advanced',
    label: 'Experienced',
    description: 'Years of consistent training, comfortable with harder bodyweight work.',
    ladderShare: 0.5,
  },
];

export interface PlacementAnswer {
  id: string;
  label: string;
  /** The rung this answer starts the ladder on; `null` = leave it to the experience level. */
  levelId: string | null;
}

export interface PlacementQuestion {
  id: string;
  familyId: ProgressionFamilyId;
  prompt: string;
  answers: readonly PlacementAnswer[];
}

export const PLACEMENT_QUESTIONS: readonly PlacementQuestion[] = [
  {
    id: 'push_ups',
    familyId: 'horizontal_push',
    prompt: 'How many full push-ups can you do in a row, with good form?',
    answers: [
      { id: 'unsure', label: 'Not sure', levelId: null },
      { id: 'none', label: 'None yet', levelId: 'horizontal_push.l1' },
      { id: 'few', label: '1 to 5', levelId: 'horizontal_push.l3' },
      { id: 'some', label: '6 to 15', levelId: 'horizontal_push.l4' },
      { id: 'many', label: 'More than 15', levelId: 'horizontal_push.l6' },
    ],
  },
  {
    id: 'pull_ups',
    familyId: 'vertical_pull',
    prompt: 'How many pull-ups or chin-ups can you do, without help?',
    answers: [
      { id: 'unsure', label: 'Not sure', levelId: null },
      { id: 'none', label: 'None yet', levelId: 'vertical_pull.l1' },
      { id: 'few', label: '1 to 3', levelId: 'vertical_pull.l6b' },
      { id: 'some', label: '4 to 8', levelId: 'vertical_pull.l7' },
      { id: 'many', label: 'More than 8', levelId: 'vertical_pull.l8' },
    ],
  },
  {
    id: 'squats',
    familyId: 'squat',
    prompt: 'How do bodyweight squats feel?',
    answers: [
      { id: 'unsure', label: 'Not sure', levelId: null },
      { id: 'hard', label: 'A handful is plenty', levelId: 'squat.l1' },
      { id: 'easy', label: '20 in a row is easy', levelId: 'squat.l3' },
      { id: 'pistol', label: 'I can do a one-leg (pistol) squat', levelId: 'squat.l7' },
    ],
  },
  {
    id: 'plank',
    familyId: 'anti_extension',
    prompt: 'How long can you hold a forearm plank with a flat back?',
    answers: [
      { id: 'unsure', label: 'Not sure', levelId: null },
      { id: 'short', label: 'Under 20 seconds', levelId: 'anti_extension.l1' },
      { id: 'medium', label: '20 seconds to a minute', levelId: 'anti_extension.l3' },
      { id: 'long', label: 'Over a minute', levelId: 'anti_extension.l5' },
    ],
  },
];
