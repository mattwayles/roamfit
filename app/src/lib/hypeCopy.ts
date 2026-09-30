/**
 * Coach-on-your-shoulder copy pools (docs/DESIGN.md §6). Short, warm, a little swagger, never
 * guilt. Pure and deterministic: `pick(pool, seed)` hashes the seed, so the same seed always
 * lands on the same line (stable tests, and no flicker when a component re-renders).
 */
import { hashSeed } from './seed';

export const setComplete = [
  'Strong set.',
  'Nailed it.',
  'Clean reps.',
  "That's the one.",
  'Keep that energy.',
  'Smooth.',
  'Money.',
  "You're rolling.",
] as const;

export const exerciseComplete = [
  'Exercise done. On to the next.',
  'Checked off.',
  "That one's in the bank.",
  'Another one down.',
] as const;

export const lastSet = ['Last set. Empty the tank.'] as const;

export const rest = [
  'Shake it out.',
  'Breathe it in.',
  'Sip some water.',
  'Loosen up.',
  "Next one's yours.",
  'Good work. Reset.',
] as const;

/** Deterministic pick: the same `(pool, seed)` always returns the same line. */
export function pick<T>(pool: readonly T[], seed: string | number): T {
  if (pool.length === 0) throw new Error('pick: empty pool');
  return pool[hashSeed(String(seed)) % pool.length]!;
}

/** Time-of-day greeting from the *local* hour of `date` (invariant 6: local time, never UTC). */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
