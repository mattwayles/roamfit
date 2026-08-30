/** Shared fixtures for store integration tests — not itself a test file (no `describe`/`it`). */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { createRng } from '@roamfit/engine';
import type { EngineClock } from '@roamfit/engine';
import { addDays } from './dates';

export const library = exerciseLibrary;
export const families = familyLibrary;
export { addDays };

export function clockFor(today: string, tzId = 'America/New_York'): EngineClock {
  return { today, tzId };
}

export function rngFor(seed: number) {
  return createRng(seed);
}

export function utcInstantFor(localDate: string, hour = 8, minute = 0): string {
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}
