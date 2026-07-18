export class MemoryCache implements Cache {
  readonly store = new Map<string, Response>();

  private key(request: RequestInfo | URL): string {
    if (typeof request === 'string') return new URL(request, window.location.origin).toString();
    if (request instanceof URL) return request.toString();
    return request.url;
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.store.get(this.key(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.store.set(this.key(request), response.clone());
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.store.delete(this.key(request));
  }

  async add(): Promise<void> { throw new Error('not implemented'); }
  async addAll(): Promise<void> { throw new Error('not implemented'); }
  async keys(): Promise<readonly Request[]> { return [...this.store.keys()].map((url) => new Request(url)); }
  async matchAll(): Promise<readonly Response[]> { return [...this.store.values()].map((response) => response.clone()); }
}

export class MemoryCacheStorage implements CacheStorage {
  readonly caches = new Map<string, MemoryCache>();

  async open(cacheName: string): Promise<Cache> {
    const existing = this.caches.get(cacheName);
    if (existing) return existing;
    const cache = new MemoryCache();
    this.caches.set(cacheName, cache);
    return cache;
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const match = await cache.match(request);
      if (match) return match;
    }
    return undefined;
  }

  async delete(cacheName: string): Promise<boolean> { return this.caches.delete(cacheName); }
  async has(cacheName: string): Promise<boolean> { return this.caches.has(cacheName); }
  async keys(): Promise<string[]> { return [...this.caches.keys()]; }
}

export function installCacheStorage(cacheStorage = new MemoryCacheStorage()): MemoryCacheStorage {
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    writable: true,
    value: cacheStorage,
  });
  Object.defineProperty(window, 'caches', {
    configurable: true,
    writable: true,
    value: cacheStorage,
  });
  return cacheStorage;
}
