/**
 * Message pool for the daily motivational push notification (user-requested feature — "I often
 * don't feel like exercising... remind me how good it feels, encourage a quick session, challenge
 * me to fit one in before the day ends, remind me of a streak, remind me I'm close to a level-up
 * ... a large pool, randomly selected each day so it doesn't get stale").
 *
 * Same register as the rest of the app's copy (CLAUDE.md invariant 4 / STATUS-5-motivation.md's
 * "grep for shame"): loss-aversion at most (a streak, a close unlock), never guilt ("you missed",
 * "you're behind"). Every template is pure text — no scheduling, no I/O — so it's trivially
 * testable and reusable if a second surface (e.g. an in-app banner) ever wants the same copy.
 */
import type { Rng } from '@roamfit/engine';

export interface MotivationContext {
  /** From `nextUnlockHero(board)` — null when there's nothing close yet. */
  hero: { familyName: string; sessionsRemaining: number } | null;
  /** `stats.weekStreak` — consecutive weeks the weekly target was hit. 0 means "say nothing
   *  streak-shaped," never "say something about a broken one." */
  weekStreak: number;
}

export interface MotivationMessage {
  id: string;
  title: string;
  body: string;
}

interface Template {
  id: string;
  applicable: (ctx: MotivationContext) => boolean;
  build: (ctx: MotivationContext) => { body: string };
}

const TITLE = 'RoamFit';

/** Always-applicable templates — no data dependency, safe from session zero onward. */
const GENERIC_TEMPLATES: Template[] = [
  {
    id: 'feel-good-1',
    applicable: () => true,
    build: () => ({
      body: "You always feel better after, never worse. That's the whole trick — just start.",
    }),
  },
  {
    id: 'feel-good-2',
    applicable: () => true,
    build: () => ({ body: 'Ten minutes from now, past-you will be glad you did this.' }),
  },
  {
    id: 'feel-good-3',
    applicable: () => true,
    build: () => ({
      body: "The hardest part is the decision. You've already made it, just do it.",
    }),
  },
  {
    id: 'quick-session-1',
    applicable: () => true,
    build: () => ({ body: 'Not feeling a full session? Quick Session is one tap and done in 15.' }),
  },
  {
    id: 'quick-session-2',
    applicable: () => true,
    build: () => ({
      body: "Short on time or motivation? A Quick Session still counts, and it's fast.",
    }),
  },
  {
    id: 'end-of-day-1',
    applicable: () => true,
    build: () => ({
      body: 'Wrap up the work day with a workout instead of the couch. Ten minutes.',
    }),
  },
  {
    id: 'end-of-day-2',
    applicable: () => true,
    build: () => ({
      body: "Before you clock out for the day — one session. You'll close it out better.",
    }),
  },
  {
    id: 'consistency-1',
    applicable: () => true,
    build: () => ({ body: "Small and often beats big and rare. Today's session can be small." }),
  },
  {
    id: 'ready-1',
    applicable: () => true,
    build: () => ({ body: 'Your next session is already built and waiting whenever you are.' }),
  },
];

/** Gated on real progress data — only enters the pool when there's something concrete to say. */
const CONDITIONAL_TEMPLATES: Template[] = [
  {
    id: 'level-up-1',
    applicable: (ctx) => ctx.hero !== null,
    build: (ctx) => ({
      // ADR 0014 — a lock-screen notification is the last place to spoil an unlock: seen by
      // people who never opened the app to look at the board.
      body: `${ctx.hero!.sessionsRemaining} ${
        ctx.hero!.sessionsRemaining === 1 ? 'session' : 'sessions'
      } to your next level.`,
    }),
  },
  {
    id: 'level-up-2',
    applicable: (ctx) => ctx.hero !== null && ctx.hero!.sessionsRemaining <= 2,
    build: (ctx) => ({
      body: `You're close on ${ctx.hero!.familyName} — ${ctx.hero!.sessionsRemaining} more and you level up.`,
    }),
  },
  {
    id: 'streak-1',
    applicable: (ctx) => ctx.weekStreak > 0,
    build: (ctx) => ({
      body: `${ctx.weekStreak} ${ctx.weekStreak === 1 ? 'week' : 'weeks'} running on target. Keep it going today.`,
    }),
  },
  {
    id: 'streak-2',
    applicable: (ctx) => ctx.weekStreak >= 2,
    build: (ctx) => ({
      body: `${ctx.weekStreak} weeks in a row hitting your target — today keeps the run alive.`,
    }),
  },
];

const TEMPLATES: Template[] = [...GENERIC_TEMPLATES, ...CONDITIONAL_TEMPLATES];

/** Every message that applies to today's context — the pool a day's notifications draw from. */
export function buildMotivationPool(ctx: MotivationContext): MotivationMessage[] {
  return TEMPLATES.filter((t) => t.applicable(ctx)).map((t) => ({
    id: t.id,
    title: TITLE,
    ...t.build(ctx),
  }));
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks `count` messages for one day, deterministically from `rng`. Distinct as long as the
 *  pool is at least `count` long; only cycles back into repeats if the user asked for more
 *  notifications than there are applicable messages. */
export function pickDailyMessages(
  pool: readonly MotivationMessage[],
  count: number,
  rng: Rng,
): MotivationMessage[] {
  if (pool.length === 0 || count <= 0) return [];
  const shuffled = shuffle(pool, rng);
  const picks: MotivationMessage[] = [];
  for (let i = 0; i < count; i += 1) {
    picks.push(shuffled[i % shuffled.length]);
  }
  return picks;
}
