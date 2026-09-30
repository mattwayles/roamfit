/** Human labels for a session focus — shared by Generate (the tiles) and Approval (the boarding
 *  pass), so the same word names the same choice on both screens. */
import type { Focus } from '@roamfit/data';
import type { Difficulty } from '@roamfit/engine';

export const FOCUS_LABELS: Record<Focus, string> = {
  upper: 'Upper',
  abs: 'Core',
  legs: 'Legs',
  full: 'Full body',
  cardio: 'Cardio Only',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
