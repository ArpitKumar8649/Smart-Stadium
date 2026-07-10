import { env } from '../../config/env.js';

/**
 * Token bucket guarding LLM calls against the provider's rate ceiling.
 * See ADR 0007. Size leaves headroom below the real limit; calls that
 * exceed the bucket await a refill slot rather than 429-ing.
 */
class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private last = Date.now();
  private waiters: Array<() => void> = [];

  constructor(capacity: number, refillPerMinute: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = refillPerMinute / 60_000;
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    while (this.tokens >= 1 && this.waiters.length) {
      this.tokens -= 1;
      this.waiters.shift()!();
    }
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
}

export const llmBucket = new TokenBucket(env.LLM_BUCKET_SIZE, env.LLM_BUCKET_REFILL_PER_MIN);

// Drain waiters periodically so refills happen even without new acquire calls.
setInterval(() => (llmBucket as unknown as { refill(): void }).refill(), 1_000).unref();
