import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = '0px';
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

class MockResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type Listener = (event?: Event) => void;

class MockMediaQueryList extends EventTarget implements MediaQueryList {
  media: string;
  matches: boolean;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;
  constructor(query: string) {
    super();
    this.media = query;
    this.matches = false;
  }
  addListener(listener: Listener) { this.addEventListener('change', listener as EventListener); }
  removeListener(listener: Listener) { this.removeEventListener('change', listener as EventListener); }
  dispatch(nextMatches = this.matches) {
    this.matches = nextMatches;
    const event = new Event('change') as MediaQueryListEvent;
    Object.defineProperty(event, 'matches', { value: this.matches });
    Object.defineProperty(event, 'media', { value: this.media });
    this.dispatchEvent(event);
    this.onchange?.call(this, event);
  }
}

export const mediaQueries = new Map<string, MockMediaQueryList>();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => {
    const existing = mediaQueries.get(query);
    if (existing) return existing;
    const mql = new MockMediaQueryList(query);
    mediaQueries.set(query, mql);
    return mql;
  },
});

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});
Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mediaQueries.clear();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:mock-url') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Mock Firebase module to avoid init issues in tests
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    signOut: vi.fn(),
  })),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  onIdTokenChanged: vi.fn((auth, cb) => {
    // Invoke immediately with null user by default, or could invoke with fake user
    cb(null); 
    return () => {}; // unsubscribe function
  }),
}));
