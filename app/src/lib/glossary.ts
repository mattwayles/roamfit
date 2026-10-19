/**
 * Track 37e — the glossary: every term the app uses, in plain words, reachable from Settings →
 * Learn → Glossary. Alphabetical within each group; the screen renders groups in this order.
 */

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface GlossaryGroup {
  title: string;
  terms: GlossaryTerm[];
}

export const GLOSSARY: readonly GlossaryGroup[] = [
  {
    title: 'Training basics',
    terms: [
      {
        term: 'Rep',
        definition: 'One complete movement: down and back up for a squat, out and back for a row.',
      },
      {
        term: 'Set',
        definition:
          'A run of reps done without stopping, or one hold. "3 sets of 10" is 10 reps, rest, three times.',
      },
      {
        term: 'Hold',
        definition:
          'An exercise done for time rather than reps, like a plank. You hold the position until the timer ends.',
      },
      {
        term: 'Rest',
        definition:
          'The break between sets. Wanderlift times it for you; longer rest lets you work harder on the next set.',
      },
      {
        term: 'Tempo',
        definition:
          'How long each rep takes, in seconds. A slower tempo makes the same exercise harder.',
      },
      {
        term: 'Unilateral',
        definition: 'One side at a time: one arm or one leg. Your set is done once both sides are.',
      },
      {
        term: 'Warm-up',
        definition:
          'Easy movement at the start that raises your heart rate and loosens the joints you are about to use.',
      },
      {
        term: 'Cool-down',
        definition:
          'Gentle stretches at the end, to bring your breathing down and ease tight muscles.',
      },
      {
        term: 'Difficulty: Easy, Medium, Hard',
        definition:
          'How hard today should feel. Easy leaves plenty in the tank, Medium ends each set with a few good reps left, Hard ends close to your limit with good form.',
      },
    ],
  },
  {
    title: 'Bands and equipment',
    terms: [
      {
        term: 'Loop band',
        definition:
          'A long, continuous band that you stand on, wrap around an anchor, or loop around your body.',
      },
      {
        term: 'Band (B1 to B5)',
        definition:
          'Your bands, lightest (B1) to heaviest (B5). Name and colour each one in Settings → Your bands, so a prescription matches the band in your bag.',
      },
      {
        term: 'Band stacking',
        definition:
          'Using your heaviest band together with a lighter one, side by side, for more tension than either alone. Turn it on in Settings → Your bands once B5 is no longer enough.',
      },
      {
        term: 'Anchor point',
        definition:
          'Something fixed you attach a band to: low (ankle height), mid (waist to chest) or high (above your head). Anything you trust to hold — see Anchor safety.',
      },
      {
        term: 'Self-anchored',
        definition:
          'The band is held in place by your own body — under your feet, around your thighs — so no anchor point is needed.',
      },
      {
        term: 'Available equipment',
        definition:
          'What you have to hand today. Wanderlift only builds workouts from what you have ticked.',
      },
    ],
  },
  {
    title: 'How Wanderlift plans',
    terms: [
      {
        term: 'Focus',
        definition: 'What a workout trains: Upper, Legs, Core, Full body or Cardio Only.',
      },
      {
        term: 'Trail',
        definition:
          'One movement pattern’s progression, like push-ups or squats. You climb each trail at your own pace.',
      },
      {
        term: 'Level (rung)',
        definition:
          'One step on a trail. Each level is a harder version of the movement than the one below it.',
      },
      {
        term: 'Level up',
        definition:
          'Moving to the next level. It happens when you meet your targets, or straight away when you tell Wanderlift a level is too easy.',
      },
      {
        term: 'Progression',
        definition:
          'How a workout gets harder over time: a rep more, then a heavier band, then a slower tempo, shorter rest or an extra set, then the next level.',
      },
      {
        term: 'Too easy / Just right / Too hard',
        definition: 'Your answer after an exercise. It steers what Wanderlift gives you next time.',
      },
      {
        term: 'Recommended focus',
        definition:
          'The area you have trained least in the past week, suggested as today’s workout. Always just a suggestion.',
      },
      {
        term: 'Cardio add-on',
        definition: 'A few short bursts of cardio spread through a strength workout.',
      },
      {
        term: 'Quick Session',
        definition: 'A short workout built in one tap, for days with only a few minutes.',
      },
      {
        term: 'Recovery Workout',
        definition:
          'A lighter workout: fewer sets and an easier step on each trail, for when you need a gentler day.',
      },
      {
        term: 'Welcome back',
        definition:
          'After a week or more away, Wanderlift eases you in with a slightly lighter workout. No catching up needed.',
      },
      {
        term: 'Limitations',
        definition:
          'Body areas or conditions you have asked Wanderlift to work around. Exercises that load them are left out.',
      },
    ],
  },
  {
    title: 'Movement patterns',
    terms: [
      { term: 'Push', definition: 'Moving a load away from you: push-ups, presses.' },
      { term: 'Pull', definition: 'Bringing a load toward you: rows, pulldowns, pull-ups.' },
      {
        term: 'Horizontal / vertical',
        definition:
          'The direction of a push or pull: straight out in front (horizontal), or overhead and down (vertical).',
      },
      {
        term: 'Squat',
        definition: 'Bending at the knees and hips together, chest up, then standing.',
      },
      {
        term: 'Hinge',
        definition:
          'Bending at the hips with a flat back while the knees stay soft: deadlifts, glute bridges, swings.',
      },
      {
        term: 'Lunge',
        definition:
          'A split stance, one foot forward or back, lowering and rising on the front leg.',
      },
      {
        term: 'Anti-rotation / anti-extension',
        definition:
          'Core work where the job is to stop movement: not twisting, or not letting the low back arch.',
      },
      {
        term: 'Abduction / adduction',
        definition:
          'Moving a leg out to the side (abduction, outer hip) or in toward the other (adduction, inner thigh).',
      },
      {
        term: 'Isolation',
        definition: 'An exercise that works mainly one muscle, like a curl or a lateral raise.',
      },
    ],
  },
  {
    title: 'Your record',
    terms: [
      {
        term: 'Journey',
        definition: 'Your long-term story: trails climbed, sets completed, places trained.',
      },
      { term: 'Logbook', definition: 'A calendar of every workout you have done.' },
      {
        term: 'Passport',
        definition:
          'Optional. A stamp for each town you complete a workout in, if you turn on location in Settings.',
      },
      {
        term: 'Badges',
        definition:
          'Awards for milestones: showing up, climbing the ladders, pushing a little harder, and exploring. You earn each one by reaching its goal, and once earned it is yours for good. There are no streaks, and nothing expires.',
      },
      {
        term: 'Best set',
        definition:
          'The most reps or longest hold you have done on an exercise at its heaviest band.',
      },
    ],
  },
];
