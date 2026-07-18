import { beforeEach, describe, expect, it, vi } from 'vitest';

async function importFreshPwa() {
  vi.resetModules();
  const mock = await import('./test/pwaRegisterMock.ts');
  mock.registerSW.mockReset();
  await import('./pwa.ts');
  return mock.registerSW;
}

describe('pwa lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T00:00:00.000Z'));
  });

  it('reloads once for a stale lazy chunk within the cooldown window', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    await importFreshPwa();

    const first = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_001);
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('registers the service worker and reloads only once for repeated update callbacks', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const registerSW = await importFreshPwa();

    expect(registerSW).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
    const options = registerSW.mock.calls[0]?.[0] as { onNeedReload: () => void };
    options.onNeedReload();
    options.onNeedReload();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
