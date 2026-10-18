/**
 * Track 37d — the anchor safety guide's copy. Shown as an onboarding step and always reachable from
 * Settings → Learn → Anchor safety. Plain data so the screen, the onboarding step and the tests read
 * the same words.
 *
 * Deliberately names no particular objects to anchor to: an anchor point is anything the user
 * trusts to hold a band under tension, and the guide is about how to judge that, not a shopping
 * list of things that happen to be nearby.
 */

export interface SafetySection {
  id: string;
  title: string;
  points: string[];
}

export const ANCHOR_SAFETY_INTRO =
  'Bands store a lot of energy. Almost every band injury comes from an anchor slipping or a band ' +
  'snapping, and both are preventable. A minute with this guide is worth it.';

export const ANCHOR_SAFETY_SECTIONS: readonly SafetySection[] = [
  {
    id: 'choose',
    title: 'Choosing an anchor point',
    points: [
      'Use something that will not move, roll, tip or flex when you pull hard on it.',
      'Give it a firm test tug before your first set, every session.',
      'Avoid sharp or rough edges — they cut bands. Wrap or pad them, or pick another point.',
      'Never anchor to anything that could fall on you, or to anything hot.',
      'Low is around ankle height, mid is waist to chest height, high is above your head.',
    ],
  },
  {
    id: 'door',
    title: 'Using a door anchor',
    points: [
      'Shut the door so it closes toward the direction you pull. You should be pulling it shut, never open.',
      'Lock it if you can, and tell anyone else at home. Never use a door someone might open.',
      'The hinge side holds best. Keep the anchor strap flat and fully closed in the door gap.',
    ],
  },
  {
    id: 'check',
    title: 'Checking your bands',
    points: [
      'Before each session, stretch each band you will use and look for nicks, tears, thin or sticky patches, and brittle spots.',
      'Look hardest where the band wraps an anchor or a handle. That is where wear starts.',
      'Retire a damaged band. A band that snaps mid-set is the injury this guide exists to prevent.',
      'Store bands out of sunlight and away from heat.',
    ],
  },
  {
    id: 'during',
    title: 'During a set',
    points: [
      'Step into tension slowly, and control the band back. Never let go of a stretched band.',
      'Keep a stretched band’s path away from your face where you can.',
      'Train on a non-slip surface, in shoes or bare feet, never in socks.',
      'If anything shifts, creaks or slips, stop and re-anchor before the next rep.',
    ],
  },
  {
    id: 'bars',
    title: 'Bars, benches and steps',
    points: [
      'Before you hang from a bar or press off a bench or step, check it takes your full weight without moving.',
      'Re-check a doorway pull-up bar’s fit each time you mount it.',
    ],
  },
];
