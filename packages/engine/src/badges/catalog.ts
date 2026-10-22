import { BAND_ORDER } from '../types';
import type { BadgeCategory, BadgeDefinition, BadgeFacts, BadgeTier } from './types';

/**
 * Number of progression families (ladders) in v1. "Every ladder" badges target this; a test pins
 * it to the data package so adding a family forces a conscious decision here (and a new family
 * only ever makes those badges harder to earn *later*, never revokes one already earned).
 */
export const LADDER_FAMILY_COUNT = 8;

/** The focuses `all_rounder` asks for. Cardio is an add-on, not a day you plan around. */
export const ALL_ROUNDER_FOCUSES: readonly string[] = ['upper', 'abs', 'legs', 'full'];

/** Ring tiers for a series of `n` badges, lightest first; the last of a multi-badge series is the
 *  summit, a lone badge is gold. */
function tiersFor(n: number): BadgeTier[] {
  if (n === 1) return ['gold'];
  const rings: BadgeTier[] = ['bronze', 'silver', 'gold'];
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? 'summit' : rings[Math.floor((i * rings.length) / (n - 1))],
  );
}

interface SeriesSpec {
  series: string;
  category: BadgeCategory;
  icon: string;
  measure: (f: BadgeFacts) => number;
  /** One entry per tier: the threshold, the id suffix (defaults to the threshold), name, copy. */
  tiers: { target: number; suffix?: string; name: string; description: string; hint?: string }[];
  /** A positive "how to" line shown on a locked badge; each tier may override it with its own. */
  hint?: string;
  /** A positive riddle for a hidden series (shown while the badge is still a mystery). */
  riddle?: string;
  hidden?: boolean;
  passport?: boolean;
}

function series(spec: SeriesSpec): BadgeDefinition[] {
  const rings = tiersFor(spec.tiers.length);
  return spec.tiers.map((t, i) => ({
    id: `${spec.series}_${t.suffix ?? t.target}`,
    series: spec.series,
    tier: rings[i],
    category: spec.category,
    name: t.name,
    description: t.description,
    ...((t.hint ?? spec.hint) ? { hint: (t.hint ?? spec.hint)! } : {}),
    icon: spec.icon,
    ...(spec.riddle ? { riddle: spec.riddle } : {}),
    ...(spec.hidden ? { hidden: true } : {}),
    ...(spec.passport ? { passport: true } : {}),
    target: t.target,
    measure: spec.measure,
  }));
}

const bandIndex = (id: string): number => BAND_ORDER.indexOf(id as (typeof BAND_ORDER)[number]);

export const BADGES: readonly BadgeDefinition[] = [
  // ---- Showing up ----
  ...series({
    series: 'sessions',
    hint: 'Finish a workout and it counts, whatever the length.',
    category: 'showing_up',
    icon: 'walk',
    measure: (f) => f.sessionsCompleted,
    tiers: [
      { target: 1, name: 'First Steps', description: 'Finish your first workout.' },
      { target: 5, name: 'Trailhead', description: 'Finish 5 workouts.' },
      { target: 10, name: 'On the Path', description: 'Finish 10 workouts.' },
      { target: 25, name: 'Trail Regular', description: 'Finish 25 workouts.' },
      { target: 50, name: 'Wayfarer', description: 'Finish 50 workouts.' },
      { target: 100, name: 'Centurion', description: 'Finish 100 workouts.' },
      { target: 250, name: 'Long Road', description: 'Finish 250 workouts.' },
      { target: 500, name: 'Cartographer', description: 'Finish 500 workouts.' },
    ],
  }),
  ...series({
    series: 'minutes',
    hint: 'Every minute of a finished workout adds up.',
    category: 'showing_up',
    icon: 'timer',
    measure: (f) => f.totalMinutes,
    tiers: [
      { target: 60, name: 'First Hour', description: 'Train for 60 minutes in total.' },
      { target: 300, name: 'Five Hours In', description: 'Train for 300 minutes in total.' },
      { target: 1000, name: 'Thousand Minutes', description: 'Train for 1,000 minutes in total.' },
      { target: 3000, name: 'Time Well Spent', description: 'Train for 3,000 minutes in total.' },
      { target: 6000, name: 'Hundred Hours', description: 'Train for 6,000 minutes in total.' },
    ],
  }),
  ...series({
    series: 'active_weeks',
    hint: 'Any workout in a week counts that week, one is plenty.',
    category: 'showing_up',
    icon: 'sun',
    measure: (f) => f.distinctActiveWeeks,
    tiers: [
      { target: 4, name: 'A Month of Weeks', description: 'Train in 4 different weeks.' },
      { target: 12, name: 'A Season', description: 'Train in 12 different weeks.' },
      { target: 26, name: 'Half a Year', description: 'Train in 26 different weeks.' },
      { target: 52, name: 'A Year on the Trail', description: 'Train in 52 different weeks.' },
      { target: 104, name: 'Two Years Strong', description: 'Train in 104 different weeks.' },
    ],
  }),
  ...series({
    series: 'all_rounder',
    hint: 'Generate a workout for each focus: upper, abs, legs and full body.',
    category: 'showing_up',
    icon: 'body',
    measure: (f) => ALL_ROUNDER_FOCUSES.filter((x) => f.focusesTrained.includes(x)).length,
    tiers: [
      {
        target: ALL_ROUNDER_FOCUSES.length,
        name: 'All-Rounder',
        description: 'Train upper body, abs, legs and a full-body session.',
      },
    ],
  }),
  ...series({
    series: 'early_bird',
    riddle: 'The trail is quietest before sunrise.',
    category: 'showing_up',
    icon: 'sun',
    hidden: true,
    measure: (f) => f.earlySessions,
    tiers: [{ target: 1, name: 'Early Bird', description: 'Start a workout before 7 AM.' }],
  }),
  ...series({
    series: 'night_owl',
    riddle: 'Some paths are best walked under the stars.',
    category: 'showing_up',
    icon: 'moon',
    hidden: true,
    measure: (f) => f.lateSessions,
    tiers: [{ target: 1, name: 'Night Owl', description: 'Start a workout at 9 PM or later.' }],
  }),
  ...series({
    series: 'comeback',
    hint: 'Take your time; the next workout you finish after a break counts.',
    category: 'showing_up',
    icon: 'refresh',
    measure: (f) => f.comebacks,
    tiers: [
      { target: 1, name: 'Back on the Trail', description: 'Come back and finish a workout.' },
      {
        target: 3,
        name: 'Always Welcome',
        description: 'Come back and finish a workout, 3 times.',
      },
    ],
  }),
  ...series({
    series: 'recovery_week',
    hint: 'Choose a recovery week when you generate a workout, and let it be lighter.',
    category: 'showing_up',
    icon: 'leaf',
    measure: (f) => f.recoveryWeeksCompleted,
    tiers: [
      { target: 1, name: 'Rest Stop', description: 'Finish a recovery week. Resting counts.' },
    ],
  }),

  // ---- Climbing ----
  ...series({
    series: 'level_ups',
    hint: 'Keep logging your sets; the engine moves you up when you are ready.',
    category: 'climbing',
    icon: 'trendingUp',
    measure: (f) => f.levelUpsTotal,
    tiers: [
      { target: 1, name: 'First Rung', description: 'Move up a rung on any ladder.' },
      { target: 5, name: 'Stepping Up', description: 'Move up 5 rungs.' },
      { target: 10, name: 'Rising', description: 'Move up 10 rungs.' },
      { target: 25, name: 'Ascending', description: 'Move up 25 rungs.' },
      { target: 50, name: 'Skyward', description: 'Move up 50 rungs.' },
    ],
  }),
  ...series({
    series: 'high_rung',
    hint: 'Keep climbing any one ladder; each rung leads to the next.',
    category: 'climbing',
    icon: 'up',
    measure: (f) => f.highestLevelOrdinal,
    tiers: [
      { target: 4, name: 'Foothills', description: 'Reach rung 4 on any ladder.' },
      { target: 7, name: 'High Ground', description: 'Reach rung 7 on any ladder.' },
      { target: 10, name: 'Above the Treeline', description: 'Reach rung 10 on any ladder.' },
      { target: 12, name: 'Top of the Ladder', description: 'Reach rung 12 on any ladder.' },
    ],
  }),
  ...series({
    series: 'summit',
    hint: 'Stay with one ladder until you reach its top rung.',
    category: 'climbing',
    icon: 'flag',
    measure: (f) => f.familiesAtTop.length,
    tiers: [
      { target: 1, name: 'Summit', description: 'Reach the top rung of a ladder.' },
      { target: 3, name: 'Three Peaks', description: 'Reach the top of 3 ladders.' },
      {
        target: LADDER_FAMILY_COUNT,
        suffix: 'all',
        name: 'Every Peak',
        description: 'Reach the top of every ladder.',
      },
    ],
  }),
  ...series({
    series: 'well_rounded',
    hint: 'Train every movement pattern so each ladder reaches rung 3.',
    category: 'climbing',
    icon: 'shield',
    measure: (f) => f.familiesAtOrAbove3,
    tiers: [
      {
        target: LADDER_FAMILY_COUNT,
        suffix: 'all',
        name: 'Well Rounded',
        description: 'Reach rung 3 on every ladder.',
      },
    ],
  }),
  // Measured as band index + 1 so "no band yet" (-1) is 0 and B1 shows as 1 step along.
  ...series({
    series: 'heavy_band',
    hint: 'Move up a band when a set feels easy, then finish a set with it.',
    category: 'climbing',
    icon: 'barbell',
    measure: (f) => f.heaviestBandOrdinal + 1,
    tiers: [
      {
        target: bandIndex('B3') + 1,
        suffix: 'b3',
        name: 'Getting Heavier',
        description: 'Finish a set with the B3 band.',
      },
      {
        target: bandIndex('B4') + 1,
        suffix: 'b4',
        name: 'Heavy Duty',
        description: 'Finish a set with the B4 band.',
      },
      {
        target: bandIndex('B5') + 1,
        suffix: 'b5',
        name: 'Maximum Tension',
        description: 'Finish a set with the B5 band.',
      },
      {
        target: bandIndex('B5+B1') + 1,
        suffix: 'stacked',
        name: 'Doubled Up',
        description: 'Finish a set with stacked bands.',
      },
    ],
  }),

  // ---- Pushing ----
  ...series({
    series: 'best_sets',
    hint: 'Beat your reps or hold time on an exercise to set a best.',
    category: 'pushing',
    icon: 'star',
    measure: (f) => f.bestSetPrsTotal,
    tiers: [
      { target: 1, name: 'Personal Best', description: 'Set your first best set.' },
      { target: 10, name: 'Raising the Bar', description: 'Set 10 best sets.' },
      { target: 25, name: 'Record Keeper', description: 'Set 25 best sets.' },
      { target: 50, name: 'Always Improving', description: 'Set 50 best sets.' },
      { target: 100, name: 'Hundred Bests', description: 'Set 100 best sets.' },
    ],
  }),
  ...series({
    series: 'record_day',
    riddle: 'One good day can outshine a whole week.',
    category: 'pushing',
    icon: 'sparkles',
    hidden: true,
    measure: (f) => f.maxPrsInOneSession,
    tiers: [{ target: 3, name: 'Record Day', description: 'Set 3 best sets in a single workout.' }],
  }),
  ...series({
    series: 'hard_sessions',
    hint: 'Choose Hard when you generate a workout.',
    category: 'pushing',
    icon: 'flame',
    measure: (f) => f.hardSessionsCompleted,
    tiers: [
      { target: 1, name: 'Turning Up the Heat', description: 'Finish a workout set to Hard.' },
      { target: 10, name: 'Bring It', description: 'Finish 10 workouts set to Hard.' },
      { target: 25, name: 'Hard-Earned', description: 'Finish 25 workouts set to Hard.' },
      { target: 50, name: 'Forged', description: 'Finish 50 workouts set to Hard.' },
    ],
  }),
  ...series({
    series: 'clean_sweep',
    hint: 'Generate a workout of 6 or more sets and complete every one.',
    category: 'pushing',
    icon: 'checkCircle',
    measure: (f) => f.cleanSweepSessions,
    tiers: [
      {
        target: 1,
        name: 'Clean Sweep',
        description: 'Finish every planned set in a workout of 6 or more sets.',
      },
      { target: 10, name: 'Thorough', description: 'Do a clean sweep 10 times.' },
      { target: 25, name: 'Every Last Rep', description: 'Do a clean sweep 25 times.' },
    ],
  }),
  ...series({
    series: 'reps',
    hint: 'Every completed rep counts, in any workout.',
    category: 'pushing',
    icon: 'fitness',
    measure: (f) => f.lifetimeReps,
    tiers: [
      { target: 1000, name: 'Thousand Reps', description: 'Complete 1,000 reps.' },
      { target: 5000, name: 'Five Thousand', description: 'Complete 5,000 reps.' },
      { target: 10000, name: 'Ten Thousand', description: 'Complete 10,000 reps.' },
      { target: 25000, name: 'Rep Machine', description: 'Complete 25,000 reps.' },
      { target: 50000, name: 'Fifty Thousand', description: 'Complete 50,000 reps.' },
    ],
  }),
  ...series({
    series: 'hold_time',
    hint: 'Planks and other holds add their seconds to the total.',
    category: 'pushing',
    icon: 'pause',
    measure: (f) => f.lifetimeHoldSeconds,
    tiers: [
      { target: 600, name: 'Steady', description: 'Hold for 10 minutes in total.' },
      { target: 3600, name: 'Rock Solid', description: 'Hold for an hour in total.' },
      { target: 10800, name: 'Immovable', description: 'Hold for 3 hours in total.' },
    ],
  }),
  ...series({
    series: 'long_haul',
    hint: 'Generate a longer workout and finish it at your own pace.',
    category: 'pushing',
    icon: 'time',
    measure: (f) => f.longestSessionMinutes,
    tiers: [
      { target: 45, name: 'Long Haul', description: 'Finish a 45-minute workout.' },
      { target: 60, name: 'Full Hour', description: 'Finish a 60-minute workout.' },
    ],
  }),

  // ---- Exploring ----
  ...series({
    series: 'exercises_tried',
    hint: 'Different workouts bring in new exercises, so each one counts.',
    category: 'exploring',
    icon: 'search',
    measure: (f) => f.distinctExercisesPerformed,
    tiers: [
      { target: 10, name: 'Curious', description: 'Try 10 different exercises.' },
      { target: 25, name: 'Explorer', description: 'Try 25 different exercises.' },
      { target: 50, name: 'Field Guide', description: 'Try 50 different exercises.' },
      { target: 100, name: 'Master Explorer', description: 'Try 100 different exercises.' },
    ],
  }),
  ...series({
    series: 'cities',
    hint: 'Turn on Passport and work out while you travel.',
    category: 'exploring',
    icon: 'pin',
    passport: true,
    measure: (f) => (f.passportEnabled ? f.citiesVisited : 0),
    tiers: [
      { target: 3, name: 'Three Stops', description: 'Work out in 3 different cities.' },
      { target: 10, name: 'Well Travelled', description: 'Work out in 10 different cities.' },
      { target: 25, name: 'Globetrotter', description: 'Work out in 25 different cities.' },
    ],
  }),
  ...series({
    series: 'countries',
    hint: 'Turn on Passport and work out while you travel.',
    category: 'exploring',
    icon: 'globe',
    passport: true,
    measure: (f) => (f.passportEnabled ? f.countriesVisited : 0),
    tiers: [
      { target: 2, name: 'Border Crossing', description: 'Work out in 2 different countries.' },
      { target: 5, name: 'World Wanderer', description: 'Work out in 5 different countries.' },
    ],
  }),
];
