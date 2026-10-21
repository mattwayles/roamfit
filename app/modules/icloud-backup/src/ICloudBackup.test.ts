import { download, isAvailable, stat, upload } from '../index';
import mock from './ICloudBackupModule';

// `./ICloudBackupModule` resolves to the in-memory fake (installed by jest.setup.js).
const fake = mock as unknown as {
  __reset(): void;
  __setAvailable(a: boolean): void;
  __setLocalFile(p: string, b: string): void;
  __getLocalFile(p: string): string | undefined;
  __setStored(w: 'latest' | 'previous', b: string | null, m?: number): void;
  __getStored(w: 'latest' | 'previous'): string | null;
  __failNext(fn: 'isAvailable' | 'upload' | 'download' | 'stat', code: string): void;
};

beforeEach(() => fake.__reset());

describe('iCloud backup wrapper over the fake native module', () => {
  it('reports availability', async () => {
    expect(await isAvailable()).toBe(true);
    fake.__setAvailable(false);
    expect(await isAvailable()).toBe(false);
  });

  it('has nothing stored to begin with', async () => {
    expect(await stat()).toBeNull();
    expect(await download('/tmp/x.db')).toBe(false);
    expect(await download('/tmp/x.db', 'previous')).toBe(false);
  });

  it('uploads, then stats and downloads the latest copy (file:// and plain paths)', async () => {
    fake.__setLocalFile('/snap/a.db', 'AAAA');
    await upload('file:///snap/a.db');
    expect(await stat()).toEqual({ modifiedAt: expect.any(Number), size: 4 });
    expect(await download('file:///out/a.db')).toBe(true);
    expect(fake.__getLocalFile('/out/a.db')).toBe('AAAA');
    expect(await stat('previous')).toBeNull();
  });

  it('rotates the latest copy to previous on each upload', async () => {
    fake.__setLocalFile('/snap/a.db', 'one');
    await upload('/snap/a.db');
    fake.__setLocalFile('/snap/a.db', 'two');
    await upload('/snap/a.db');
    fake.__setLocalFile('/snap/a.db', 'three');
    await upload('/snap/a.db');

    expect(fake.__getStored('latest')).toBe('three');
    expect(fake.__getStored('previous')).toBe('two');
    expect(await download('/out/prev.db', 'previous')).toBe(true);
    expect(fake.__getLocalFile('/out/prev.db')).toBe('two');
    const latest = await stat('latest');
    const previous = await stat('previous');
    expect(latest!.modifiedAt).toBeGreaterThan(previous!.modifiedAt);
  });

  it('rejects an upload of a file that does not exist, or without iCloud', async () => {
    await expect(upload('/nope.db')).rejects.toMatchObject({ code: 'ERR_SOURCE_MISSING' });
    fake.__setLocalFile('/snap/a.db', 'x');
    fake.__setAvailable(false);
    await expect(upload('/snap/a.db')).rejects.toMatchObject({ code: 'ERR_ICLOUD_UNAVAILABLE' });
  });

  it('can be told to fail once, then recovers', async () => {
    fake.__setStored('latest', 'zz');
    fake.__failNext('download', 'ERR_DOWNLOAD_TIMEOUT');
    await expect(download('/out/z.db')).rejects.toMatchObject({ code: 'ERR_DOWNLOAD_TIMEOUT' });
    expect(await download('/out/z.db')).toBe(true);
  });

  it('reset clears everything', async () => {
    fake.__setStored('latest', 'zz');
    fake.__reset();
    expect(await stat()).toBeNull();
  });
});
