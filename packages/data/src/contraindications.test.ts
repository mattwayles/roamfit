/**
 * Track 37c — consistency guards from the 2026-10 contraindication review
 * (docs/review/contraindications-review-2026-10.md). Each guard reads an exercise's own name and
 * setup cue for a position the review decided must always carry a tag, so a new or reworded
 * exercise can't silently slip past a limitation. They catch the obvious cases only; they are not
 * the review.
 */
import { exerciseLibrary } from './index';
import type { Contraindication } from './schema';

const GUARDS: { tag: Contraindication; position: RegExp; why: string }[] = [
  {
    tag: 'lying_supine',
    position: /\b(on your back|lie on (your )?back|lie flat|lying on your back)\b/,
    why: 'lying on the back is filtered for the pregnancy choice',
  },
  {
    tag: 'lying_prone',
    position: /\b(face down|prone|chest to the ground)\b/,
    why: 'lying on the front is filtered for the pregnancy choice',
  },
  {
    tag: 'wrist_extension',
    position: /\b(hands and knees|quadruped|high plank|hands under shoulders)\b/,
    why: 'bodyweight on an extended wrist',
  },
];

describe('contraindication consistency guards', () => {
  for (const guard of GUARDS) {
    it(`every exercise whose cue puts you ${guard.position.source} carries ${guard.tag} (${guard.why})`, () => {
      const missing = exerciseLibrary.exercises
        .filter((e) => guard.position.test(`${e.name} ${e.setup}`.toLowerCase()))
        .filter((e) => !e.contraindications.includes(guard.tag))
        .map((e) => e.id);
      expect(missing).toEqual([]);
    });
  }

  it('no exercise carries the same tag twice', () => {
    for (const e of exerciseLibrary.exercises) {
      expect(new Set(e.contraindications).size).toBe(e.contraindications.length);
    }
  });

  it('pins the review’s deliberate removals (each was judged over-cautious, not missed)', () => {
    const tags = (id: string) =>
      exerciseLibrary.exercises.find((e) => e.id === id)!.contraindications;
    // Prenatal and back-care staples: low intra-abdominal pressure.
    for (const id of ['wu-cat-cow', 'cd-childs-pose', 'bw-bird-dog', 'bird-dog']) {
      expect(tags(id)).not.toContain('core_pressure');
    }
    // Forearm side planks put no load on an extended wrist.
    for (const id of ['bw-side-plank', 'bw-side-plank-hip-dip']) {
      expect(tags(id)).not.toContain('wrist_extension');
    }
    // Scapular push-ups are protraction/retraction in a plank, not overhead work.
    expect(tags('bw-scap-push-up')).not.toContain('shoulder_overhead');
  });
});
