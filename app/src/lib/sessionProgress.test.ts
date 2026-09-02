/**
 * The pure position arithmetic behind the active workout's ◂◂/▸▸ set navigation, and §10.8's
 * derived "where am I" rule it sits on top of. No store, no React — a `SessionRecord` shape is
 * all these functions ever read.
 */
import type { SessionRecord } from '@roamfit/store';
import {
  activeEntries,
  findCurrentEntry,
  positionsInOrder,
  samePosition,
  stepPosition,
} from './sessionProgress';

type Entry = SessionRecord['entries'][number];

function entry(id: string, sets: number, logged: number, removed = false): Entry {
  return {
    id,
    sets,
    entryStatus: removed ? 'removed_at_approval' : 'planned',
    setLogs: Array.from({ length: logged }, (_, i) => ({ setIndex: i })),
  } as unknown as Entry;
}

function session(entries: Entry[]): SessionRecord {
  return { entries } as unknown as SessionRecord;
}

describe('session positions', () => {
  it('lists every set of every kept entry, in plan order', () => {
    const s = session([entry('a', 2, 0), entry('b', 1, 0)]);
    expect(positionsInOrder(s)).toEqual([
      { entryId: 'a', setIndex: 0 },
      { entryId: 'a', setIndex: 1 },
      { entryId: 'b', setIndex: 0 },
    ]);
  });

  it('leaves out entries the user removed at approval, so stepping never lands on one', () => {
    const s = session([entry('a', 1, 0), entry('gone', 3, 0, true), entry('b', 1, 0)]);
    expect(activeEntries(s).map((e) => e.id)).toEqual(['a', 'b']);
    expect(positionsInOrder(s).map((p) => p.entryId)).toEqual(['a', 'b']);
  });

  it('steps back across an exercise boundary onto the previous exercise’s last set', () => {
    const s = session([entry('a', 3, 3), entry('b', 2, 0)]);
    expect(stepPosition(s, { entryId: 'b', setIndex: 0 }, -1)).toEqual({
      entryId: 'a',
      setIndex: 2,
    });
  });

  it('steps back within an exercise, and forward again to where it started', () => {
    const s = session([entry('a', 3, 2)]);
    const from = { entryId: 'a', setIndex: 2 };
    const back = stepPosition(s, from, -1);
    expect(back).toEqual({ entryId: 'a', setIndex: 1 });
    expect(stepPosition(s, back!, 1)).toEqual(from);
  });

  it('has nothing behind the first set or beyond the last', () => {
    const s = session([entry('a', 2, 0)]);
    expect(stepPosition(s, { entryId: 'a', setIndex: 0 }, -1)).toBeNull();
    expect(stepPosition(s, { entryId: 'a', setIndex: 1 }, 1)).toBeNull();
  });

  it('returns null for a position that is no longer in the plan', () => {
    const s = session([entry('a', 2, 0)]);
    expect(stepPosition(s, { entryId: 'vanished', setIndex: 0 }, -1)).toBeNull();
  });

  it('stepping changes nothing about the session — no logs added or removed', () => {
    const s = session([entry('a', 3, 2)]);
    const before = JSON.stringify(s);
    stepPosition(s, { entryId: 'a', setIndex: 2 }, -1);
    positionsInOrder(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('samePosition compares the pair, and treats null as its own value', () => {
    expect(samePosition({ entryId: 'a', setIndex: 1 }, { entryId: 'a', setIndex: 1 })).toBe(true);
    expect(samePosition({ entryId: 'a', setIndex: 1 }, { entryId: 'a', setIndex: 0 })).toBe(false);
    expect(samePosition({ entryId: 'a', setIndex: 1 }, { entryId: 'b', setIndex: 1 })).toBe(false);
    expect(samePosition(null, null)).toBe(true);
    expect(samePosition({ entryId: 'a', setIndex: 0 }, null)).toBe(false);
  });

  it('the front edge is still the first unlogged set, whatever the user is looking at', () => {
    const s = session([entry('a', 2, 2), entry('b', 2, 1)]);
    expect(findCurrentEntry(s)).toEqual({
      entry: expect.objectContaining({ id: 'b' }),
      setIndex: 1,
    });
  });
});
