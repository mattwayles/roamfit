/**
 * Track 37a — the plain-language limitation choices a user picks from (onboarding and Settings),
 * each mapped to the `contraindications[]` tags the engine's injury hard filter removes.
 *
 * Users never see a tag. They see a body area or a named condition, and the mapping lives here, in
 * content, so onboarding and Settings share one list and a later tag review changes what a choice
 * filters for every user who already picked it (the store keeps choice ids, not tags — see
 * `usersRepo.buildUserProfile`).
 *
 * Choosing one is deliberately conservative: it removes every exercise carrying any of its tags.
 * A user who finds that too broad turns the choice off; a narrower filter never silently replaces
 * the one they picked.
 */
import type { Contraindication } from './schema';

export type LimitationChoiceId =
  | 'shoulder_overhead'
  | 'shoulder_front'
  | 'elbow'
  | 'wrist'
  | 'knee'
  | 'hip'
  | 'lower_back'
  | 'neck'
  | 'ankle'
  | 'low_impact'
  | 'pregnancy';

export interface LimitationChoice {
  id: LimitationChoiceId;
  /** Short row label. */
  label: string;
  /** One line on what turning it on removes, in plain words. */
  description: string;
  /** `area` = a part of the body; `condition` = a situation that spans several. */
  kind: 'area' | 'condition';
  tags: readonly Contraindication[];
}

export const LIMITATION_CHOICES: readonly LimitationChoice[] = [
  {
    id: 'shoulder_overhead',
    label: 'Shoulder: reaching overhead',
    description: 'Skips presses, pulldowns and hangs with the arms overhead.',
    kind: 'area',
    tags: ['shoulder_overhead'],
  },
  {
    id: 'shoulder_front',
    label: 'Shoulder: pushing and flyes',
    description: 'Skips push-ups, chest presses, dips and wide flyes.',
    kind: 'area',
    tags: ['shoulder_horizontal'],
  },
  {
    id: 'elbow',
    label: 'Elbow',
    description: 'Skips curls, triceps work and moves that load a bent elbow.',
    kind: 'area',
    tags: ['elbow'],
  },
  {
    id: 'wrist',
    label: 'Wrist: weight on the hands',
    description: 'Skips planks, push-ups and anything with your weight on a bent-back wrist.',
    kind: 'area',
    tags: ['wrist_extension'],
  },
  {
    id: 'knee',
    label: 'Knee',
    description: 'Skips deep knee bends under load, lunges and jumps.',
    kind: 'area',
    tags: ['knee_flexion_loaded', 'knee_impact'],
  },
  {
    id: 'hip',
    label: 'Hip',
    description: 'Skips deep hip bends, wide stances and single-leg hip work.',
    kind: 'area',
    tags: ['hip'],
  },
  {
    id: 'lower_back',
    label: 'Lower back',
    description: 'Skips crunches, hinges, back extensions and loaded bending.',
    kind: 'area',
    tags: ['lower_back_flexion', 'lower_back_extension'],
  },
  {
    id: 'neck',
    label: 'Neck',
    description: 'Skips moves that load or flex the neck.',
    kind: 'area',
    tags: ['neck'],
  },
  {
    id: 'ankle',
    label: 'Ankle or foot',
    description: 'Skips jumps, calf raises and moves balanced on one foot.',
    kind: 'area',
    tags: ['ankle'],
  },
  {
    id: 'low_impact',
    label: 'No jumping (low impact)',
    description: 'Skips jumps, hops and rope work. Good for sore joints and for neighbours below.',
    kind: 'condition',
    tags: ['knee_impact'],
  },
  {
    id: 'pregnancy',
    label: 'Pregnant or postpartum',
    description:
      'Skips moves that bear down on the core, jumps, and lying flat on your back or front. ' +
      'Follow your clinician’s advice first.',
    kind: 'condition',
    tags: ['core_pressure', 'knee_impact', 'lying_supine', 'lying_prone'],
  },
];

const BY_ID: ReadonlyMap<string, LimitationChoice> = new Map(
  LIMITATION_CHOICES.map((c) => [c.id, c]),
);

export function isLimitationChoiceId(id: string): id is LimitationChoiceId {
  return BY_ID.has(id);
}

/** The tags a set of choices filters on, de-duplicated. Unknown ids (a choice since removed from
 *  this list) contribute nothing rather than throwing on a stored row. */
export function tagsForLimitationChoices(ids: readonly string[]): Contraindication[] {
  const out = new Set<Contraindication>();
  for (const id of ids) BY_ID.get(id)?.tags.forEach((t) => out.add(t));
  return [...out];
}
