export class MockEventSource {
  static readonly instances: MockEventSource[] = [];
  static reset() { MockEventSource.instances = []; }

  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  closed = false;

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  close() { this.closed = true; }
  emitOpen() { this.onopen?.(new Event('open')); }
  emitError() { this.onerror?.(new Event('error')); }
  emitMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', {
      data: typeof data === 'string' ? data : JSON.stringify(data),
    }));
  }
}

export function installMockEventSource() {
  MockEventSource.reset();
  Object.defineProperty(globalThis, 'EventSource', {
    configurable: true,
    writable: true,
    value: MockEventSource,
  });
  Object.defineProperty(window, 'EventSource', {
    configurable: true,
    writable: true,
    value: MockEventSource,
  });
  return MockEventSource;
}
