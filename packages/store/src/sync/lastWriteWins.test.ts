import { resolveLastWriteWins } from './lastWriteWins';

describe('§11.3 last-write-wins conflict resolution', () => {
  it('local wins when there is no remote document yet (first sync)', () => {
    const local = { updatedAt: '2026-08-01T00:00:00.000Z', v: 'local' };
    const result = resolveLastWriteWins(local, null);
    expect(result).toEqual({ winner: local, source: 'local' });
  });

  it('remote wins when its updated_at is strictly later', () => {
    const local = { updatedAt: '2026-08-01T00:00:00.000Z', v: 'local' };
    const remote = { updatedAt: '2026-08-02T00:00:00.000Z', v: 'remote' };
    const result = resolveLastWriteWins(local, remote);
    expect(result).toEqual({ winner: remote, source: 'remote' });
  });

  it('local wins when its updated_at is strictly later', () => {
    const local = { updatedAt: '2026-08-05T00:00:00.000Z', v: 'local' };
    const remote = { updatedAt: '2026-08-02T00:00:00.000Z', v: 'remote' };
    const result = resolveLastWriteWins(local, remote);
    expect(result).toEqual({ winner: local, source: 'local' });
  });

  it('an exact tie resolves to local, not remote', () => {
    const local = { updatedAt: '2026-08-01T00:00:00.000Z', v: 'local' };
    const remote = { updatedAt: '2026-08-01T00:00:00.000Z', v: 'remote' };
    const result = resolveLastWriteWins(local, remote);
    expect(result).toEqual({ winner: local, source: 'local' });
  });

  it('a remote one millisecond later still wins — this is a real millisecond comparison, not a coarse date comparison', () => {
    const local = { updatedAt: '2026-08-01T00:00:00.000Z', v: 'local' };
    const remote = { updatedAt: '2026-08-01T00:00:00.001Z', v: 'remote' };
    const result = resolveLastWriteWins(local, remote);
    expect(result.source).toBe('remote');
  });
});
