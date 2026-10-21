/**
 * Which exercises are the same movement done a different way: a banded record and its bodyweight
 * sibling (Banded Push-Up / Push-Up, Dead Bug with and without a band). A workout should hold
 * one of them, never two, so selection and swap compare `movementKey`s rather than ids.
 *
 * Derived, not authored: two records are the same movement when their ids differ only by a
 * `bw-` / `banded-` prefix, or when their names match once "Banded" is dropped. The library names
 * a few pairs one way and not the other (`squat` / `bw-squat`; `self-anchored-crunch` / `bw-crunch`),
 * so either match counts, and a guard test pins the resulting groups.
 */
import exercisesJson from '../library/exercises.json';
import type { Exercise, ExerciseLibrary } from './schema';

const library = exercisesJson as unknown as ExerciseLibrary;

function stemOf(id: string): string {
  return id.replace(/^(bw|banded)-/, '');
}

function nameKeyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(banded|band|loop|resisted)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

const parent = new Map<string, string>();

function find(x: string): string {
  let root = x;
  while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
  parent.set(x, root);
  return root;
}

function union(a: string, b: string): void {
  if (!parent.has(a)) parent.set(a, a);
  if (!parent.has(b)) parent.set(b, b);
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
}

for (const e of library.exercises) union(`s:${stemOf(e.id)}`, `n:${nameKeyOf(e.name)}`);

/** Same value for every record of one movement. An id outside the library is its own movement
 *  (or its prefix-stripped stem's, which is what a test fixture named `bw-x` / `x` expects). */
export function movementKey(id: string): string {
  const stem = `s:${stemOf(id)}`;
  return parent.has(stem) ? find(stem) : stem;
}

export function isSameMovement(a: Pick<Exercise, 'id'>, b: Pick<Exercise, 'id'>): boolean {
  return movementKey(a.id) === movementKey(b.id);
}
