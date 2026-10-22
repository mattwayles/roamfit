import { idlePauseInstant } from './repositories/sessions';

const T0 = '2026-01-01T10:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

type S = Parameters<typeof idlePauseInstant>[0];
const session = (over: Partial<S> = {}, logs: { status: string; at: number }[] = []): S =>
  ({
    startedAt: T0,
    pausedAt: null,
    entries: [
      {
        setLogs: logs.map((l) => ({ status: l.status, completedAt: at(l.at), startedAt: null })),
      },
    ],
    ...over,
  }) as unknown as S;

describe('idlePauseInstant', () => {
  it('stays running before five idle minutes', () => {
    expect(idlePauseInstant(session(), at(4.9))).toBeNull();
  });

  it('pauses at the moment the threshold was crossed, not at now', () => {
    expect(idlePauseInstant(session(), at(20))).toBe(at(5));
  });

  it('counts from the latest logged set, completed or skipped', () => {
    const s = session({}, [
      { status: 'completed', at: 3 },
      { status: 'skipped', at: 6 },
    ]);
    expect(idlePauseInstant(s, at(10))).toBeNull();
    expect(idlePauseInstant(s, at(12))).toBe(at(11));
  });

  it('ignores not_reached rows', () => {
    expect(idlePauseInstant(session({}, [{ status: 'not_reached', at: 4 }]), at(6))).toBe(at(5));
  });

  it('a later resume instant lifts the floor', () => {
    expect(idlePauseInstant(session(), at(12), at(10))).toBeNull();
    expect(idlePauseInstant(session(), at(16), at(10))).toBe(at(15));
  });

  it('does nothing when already paused or not started', () => {
    expect(idlePauseInstant(session({ pausedAt: at(1) }), at(30))).toBeNull();
    expect(idlePauseInstant(session({ startedAt: null }), at(30))).toBeNull();
  });
});
