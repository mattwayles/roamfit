import { createTestDb } from '../testHarness';
import { applyRemoteVideoConfig, getCuratedVideoId, getRemoteVideoConfig } from './remoteConfig';

describe('remoteConfig — local mirror of video/{exercise_id}', () => {
  it('an exercise with no synced config has no curated video id (never invents one, invariant 8)', () => {
    const { db } = createTestDb();
    expect(getCuratedVideoId(db, 'bw-plank')).toBeNull();
    expect(getRemoteVideoConfig(db, 'bw-plank')).toBeNull();
  });

  it('applying a pulled row makes the curated id readable', () => {
    const { db } = createTestDb();
    applyRemoteVideoConfig(db, {
      exerciseId: 'bw-plank',
      videoId: 'abc123XYZ_9',
      videoVerifiedAt: '2026-08-01T00:00:00.000Z',
      videoFlagCount: 0,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(getCuratedVideoId(db, 'bw-plank')).toBe('abc123XYZ_9');
  });

  it('a null video_id (not yet curated) round-trips as null, not a fabricated id', () => {
    const { db } = createTestDb();
    applyRemoteVideoConfig(db, {
      exerciseId: 'bw-plank',
      videoId: null,
      videoVerifiedAt: null,
      videoFlagCount: 0,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(getCuratedVideoId(db, 'bw-plank')).toBeNull();
  });

  it('re-applying updates the existing row rather than duplicating it', () => {
    const { db } = createTestDb();
    applyRemoteVideoConfig(db, {
      exerciseId: 'bw-plank',
      videoId: 'abc123XYZ_9',
      videoVerifiedAt: '2026-08-01T00:00:00.000Z',
      videoFlagCount: 0,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    applyRemoteVideoConfig(db, {
      exerciseId: 'bw-plank',
      videoId: 'def456UVW_1',
      videoVerifiedAt: '2026-09-01T00:00:00.000Z',
      videoFlagCount: 2,
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(getRemoteVideoConfig(db, 'bw-plank')).toEqual({
      exerciseId: 'bw-plank',
      videoId: 'def456UVW_1',
      videoVerifiedAt: '2026-09-01T00:00:00.000Z',
      videoFlagCount: 2,
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
  });
});
