/** Human labels for a session focus — shared by Generate (the tiles) and Approval (the boarding
 *  pass), so the same word names the same choice on both screens. */
import type { Focus } from '@roamfit/data';
import type { Difficulty } from '@roamfit/engine';
import type { AccentName } from '../theme';

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

/** The semantic `focus` color map (theme) by accent name, for `Icon` / `IconBadge` / `Chip` which
 *  take names rather than hex. Generate's tiles and the Field Guide's avatars share it. */
export const FOCUS_TONE: Record<Focus, AccentName> = {
  upper: 'ember',
  abs: 'gold',
  legs: 'summit',
  full: 'lagoon',
  cardio: 'rose',
};
