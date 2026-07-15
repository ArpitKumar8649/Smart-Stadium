const STADIUM_ASSET_CACHE = 'concourse-stadium-assets-v1';
const ROUTE_CACHE = 'concourse-navigation-routes-v1';
const ROUTE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Small, shared venue files worth warming while the landing screen is idle.
 * Per-floor room polygons remain lazy because they are much larger. */
export const STADIUM_CORE_ASSETS = [
  '/floor.geojson',
  '/stadium/floor.geojson',
  '/stadium/floorstack.json',
  '/stadium/sections.json',
  '/stadium/connections.json',
] as const;

export interface RouteCacheKey {
  fromLabel: string;
  toLabel: string;
  mode: string;
}

interface CachedRoute<T> {
  savedAt: number;
  data: T;
}

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
}

function canUseCacheStorage(): boolean {
  return typeof window !== 'undefined' && typeof caches !== 'undefined';
}

function shouldWarmOnThisConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return !connection?.saveData && !connection?.effectiveType?.includes('2g');
}

function normalizedLabel(label: string): string {
  return label.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function routeCacheRequest(key: RouteCacheKey): Request {
  const origin = typeof window === 'undefined' ? 'https://concourse.local' : window.location.origin;
  const url = new URL('/__concourse-cache/navigation-route', origin);
  url.searchParams.set('from', normalizedLabel(key.fromLabel));
  url.searchParams.set('to', normalizedLabel(key.toLabel));
  url.searchParams.set('mode', key.mode);
  return new Request(url.toString());
}

/** Warm lightweight indoor-map assets after the landing page settles. This
 * deliberately skips data-saver and 2G connections. */
export async function warmStadiumMapCache(): Promise<void> {
  if (!canUseCacheStorage() || !shouldWarmOnThisConnection()) return;

  try {
    const cache = await caches.open(STADIUM_ASSET_CACHE);
    await Promise.allSettled(
      STADIUM_CORE_ASSETS.map(async (asset) => {
        if (await cache.match(asset)) return;
        const response = await fetch(asset, { cache: 'no-cache' });
        if (response.ok) await cache.put(asset, response.clone());
      }),
    );
  } catch {
    // Caching is an optional speed-up. Normal network loading remains intact.
  }
}

/** Start the warm-up after the first landing-page paint, not during it. */
export function scheduleStadiumMapCacheWarmup(): () => void {
  if (typeof window === 'undefined') return () => {};
  const timer = window.setTimeout(() => void warmStadiumMapCache(), 2500);
  return () => window.clearTimeout(timer);
}

export async function saveRouteToCache<T>(key: RouteCacheKey, data: T): Promise<void> {
  if (!canUseCacheStorage()) return;

  try {
    const cache = await caches.open(ROUTE_CACHE);
    const response = new Response(JSON.stringify({ savedAt: Date.now(), data } satisfies CachedRoute<T>), {
      headers: { 'Content-Type': 'application/json' },
    });
    await cache.put(routeCacheRequest(key), response);
  } catch {
    // Route display must never depend on cache availability.
  }
}

export async function getCachedRoute<T>(key: RouteCacheKey): Promise<T | null> {
  if (!canUseCacheStorage()) return null;

  try {
    const cache = await caches.open(ROUTE_CACHE);
    const response = await cache.match(routeCacheRequest(key));
    if (!response) return null;
    const cached = (await response.json()) as CachedRoute<T>;
    if (!cached || typeof cached.savedAt !== 'number' || Date.now() - cached.savedAt > ROUTE_CACHE_MAX_AGE_MS) {
      await cache.delete(routeCacheRequest(key));
      return null;
    }
    return cached.data ?? null;
  } catch {
    return null;
  }
}
