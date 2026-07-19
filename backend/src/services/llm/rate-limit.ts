import { env } from '../../config/env.js';

export class LlmCapacityError extends Error {
  constructor() {
    super('The AI request queue is full.');
    this.name = 'LlmCapacityError';
  }
}

export class LlmRequestAbortedError extends Error {
  constructor() {
    super('The AI request was cancelled.');
    this.name = 'LlmRequestAbortedError';
  }
}

type Waiter = {
  resolve: () => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

/**
 * Token bucket guarding LLM calls against the provider's rate ceiling.
 * See ADR 0007. It has a finite, abort-aware wait queue so disconnected
 * browser requests cannot accumulate indefinitely behind the provider limit.
 */
class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly maxQueue: number;
  private last = Date.now();
  private readonly waiters: Waiter[] = [];

  constructor(capacity: number, refillPerMinute: number, maxQueue: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = refillPerMinute / 60_000;
    this.maxQueue = maxQueue;
  }

  refill(): void {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    while (this.tokens >= 1 && this.waiters.length) {
      this.tokens -= 1;
      const waiter = this.waiters.shift()!;
      if (waiter.signal && waiter.onAbort) {
        waiter.signal.removeEventListener('abort', waiter.onAbort);
      }
      waiter.resolve();
    }
  }

  private removeWaiter(waiter: Waiter): boolean {
    const index = this.waiters.indexOf(waiter);
    if (index === -1) return false;
    this.waiters.splice(index, 1);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
    return true;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    this.refill();
    if (signal?.aborted) throw new LlmRequestAbortedError();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    if (this.waiters.length >= this.maxQueue) throw new LlmCapacityError();

    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        ...(signal ? { signal } : {}),
      };
      this.waiters.push(waiter);
      if (signal) {
        waiter.onAbort = () => {
          if (this.removeWaiter(waiter)) reject(new LlmRequestAbortedError());
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
        // Covers the small race between the first aborted check and listener setup.
        if (signal.aborted) waiter.onAbort();
      }
    });
  }
}

export const llmBucket = new TokenBucket(
  env.LLM_BUCKET_SIZE,
  env.LLM_BUCKET_REFILL_PER_MIN,
  env.LLM_MAX_QUEUE,
);

// Drain waiters periodically so refills happen even without new acquire calls.
setInterval(() => llmBucket.refill(), 1_000).unref();
