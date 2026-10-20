export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next request will be accepted (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * Sliding-window, in-memory rate limiter. State lives per server instance, which
 * is enough to stop casual abuse on a single serverless or Node deployment.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    this.sweep(now);
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterSeconds: 0 };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs && this.hits.size < this.maxKeys) return;
    this.lastSweep = now;
    const windowStart = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (times.every((time) => time <= windowStart)) this.hits.delete(key);
    }
    // Hard cap on memory: drop the oldest keys if a flood of unique IPs arrives.
    while (this.hits.size >= this.maxKeys) {
      const oldestKey = this.hits.keys().next().value;
      if (oldestKey === undefined) break;
      this.hits.delete(oldestKey);
    }
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
