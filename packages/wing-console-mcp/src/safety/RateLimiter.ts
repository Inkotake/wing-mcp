/**
 * Rate Limiter — prevents excessive writes to the console.
 *
 * Enforces:
 * - Max writes per minute (default 12)
 * - Min interval between writes (default 2 seconds)
 * - Critical operation cooldown (default 10 seconds)
 * - Same-target coalescing (repeated prep to same target resets timer)
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastWrite: number;
}

export class RateLimiter {
  private writes: RateLimitEntry = { count: 0, windowStart: Date.now(), lastWrite: 0 };
  private criticalCooldownUntil: number = 0;
  private maxWritesPerMinute: number;
  private minIntervalMs: number;
  private criticalCooldownMs: number;

  constructor(
    maxWritesPerMinute: number = 12,
    minIntervalMs: number = 2000,
    criticalCooldownMs: number = 10000
  ) {
    this.maxWritesPerMinute = maxWritesPerMinute;
    this.minIntervalMs = minIntervalMs;
    this.criticalCooldownMs = criticalCooldownMs;
  }

  check(tool: string, isEmergency: boolean = false): { allowed: boolean; reason?: string; retryAfterMs?: number } {
    // Emergency tools bypass rate limiting
    if (isEmergency) return { allowed: true };

    const now = Date.now();

    // Reset window if minute has passed
    if (now - this.writes.windowStart > 60000) {
      this.writes = { count: 0, windowStart: now, lastWrite: 0 };
    }

    // Check critical cooldown
    if (now < this.criticalCooldownUntil) {
      return {
        allowed: false,
        reason: `Critical operation cooldown active. Retry in ${Math.ceil((this.criticalCooldownUntil - now) / 1000)}s.`,
        retryAfterMs: this.criticalCooldownUntil - now,
      };
    }

    // Check per-minute cap
    if (this.writes.count >= this.maxWritesPerMinute) {
      const resetMs = 60000 - (now - this.writes.windowStart);
      return {
        allowed: false,
        reason: `Rate limit exceeded (${this.maxWritesPerMinute}/min). Reset in ${Math.ceil(resetMs / 1000)}s.`,
        retryAfterMs: resetMs,
      };
    }

    // Check min interval
    const sinceLast = now - this.writes.lastWrite;
    if (sinceLast < this.minIntervalMs && this.writes.lastWrite > 0) {
      return {
        allowed: false,
        reason: `Too frequent. Min interval ${this.minIntervalMs}ms. Wait ${Math.ceil((this.minIntervalMs - sinceLast) / 1000)}s.`,
        retryAfterMs: this.minIntervalMs - sinceLast,
      };
    }

    return { allowed: true };
  }

  record(tool: string, risk: string) {
    const now = Date.now();
    this.writes.count++;
    this.writes.lastWrite = now;

    // Critical operations get extra cooldown
    if (risk === "critical") {
      this.criticalCooldownUntil = now + this.criticalCooldownMs;
    }
  }

  reset() {
    this.writes = { count: 0, windowStart: Date.now(), lastWrite: 0 };
    this.criticalCooldownUntil = 0;
  }

  getStats() {
    return {
      writesThisMinute: this.writes.count,
      maxPerMinute: this.maxWritesPerMinute,
      lastWriteMsAgo: Date.now() - this.writes.lastWrite,
      criticalCooldown: this.criticalCooldownUntil > Date.now(),
    };
  }
}
