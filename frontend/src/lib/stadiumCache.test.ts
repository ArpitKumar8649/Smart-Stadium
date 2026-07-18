import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STADIUM_CORE_ASSETS,
  getCachedRoute,
  saveRouteToCache,
  scheduleStadiumMapCacheWarmup,
  warmStadiumMapCache,
} from './stadiumCache.ts';
import { installCacheStorage, MemoryCacheStorage } from '../test/cacheStorageMock.ts';

describe('stadiumCache', () => {
  let cacheStorage: MemoryCacheStorage;

  beforeEach(() => {
    cacheStorage = installCacheStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T00:00:00.000Z'));
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: false, effectiveType: '4g' },
    });
  });

  it('warms only missing core assets and skips slow/data-saver connections', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(`asset:${String(url)}`));
    vi.stubGlobal('fetch', fetchMock);

    const assetCache = await cacheStorage.open('concourse-stadium-assets-v1');
    await assetCache.put(STADIUM_CORE_ASSETS[0], new Response('already cached'));

    await warmStadiumMapCache();

    expect(fetchMock).toHaveBeenCalledTimes(STADIUM_CORE_ASSETS.length - 1);
    expect(fetchMock).not.toHaveBeenCalledWith(STADIUM_CORE_ASSETS[0], expect.anything());

    fetchMock.mockClear();
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '4g' },
    });

    await warmStadiumMapCache();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves, normalizes, reads, expires, and safely ignores route cache failures', async () => {
    await saveRouteToCache({ fromLabel: ' Section   144 ', toLabel: 'SECTION 108', mode: 'low_crowd' }, { id: 1 });

    await expect(
      getCachedRoute<{ id: number }>({ fromLabel: 'section 144', toLabel: 'section 108', mode: 'low_crowd' }),
    ).resolves.toEqual({ id: 1 });

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    await expect(
      getCachedRoute<{ id: number }>({ fromLabel: 'section 144', toLabel: 'section 108', mode: 'low_crowd' }),
    ).resolves.toBeNull();

    const broken = {
      open: vi.fn(async () => { throw new Error('cache unavailable'); }),
    } as unknown as CacheStorage;
    installCacheStorage(broken as unknown as MemoryCacheStorage);

    await expect(saveRouteToCache({ fromLabel: 'a', toLabel: 'b', mode: 'fastest' }, {})).resolves.toBeUndefined();
    await expect(getCachedRoute({ fromLabel: 'a', toLabel: 'b', mode: 'fastest' })).resolves.toBeNull();
  });

  it('schedules delayed warmup and cancels it', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    const cancel = scheduleStadiumMapCacheWarmup();
    vi.advanceTimersByTime(2_499);
    expect(fetchMock).not.toHaveBeenCalled();

    cancel();
    vi.advanceTimersByTime(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
