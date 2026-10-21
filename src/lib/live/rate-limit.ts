/**
 * Jednoduchý limit požadavků v paměti procesu (token bucket podle klíče).
 * Na víc replikách platí per replika – stačí jako pojistka proti zacyklenému klientovi.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    const refilled = Math.min(
      this.capacity,
      bucket.tokens + ((now - bucket.at) / 1000) * this.refillPerSecond,
    );
    if (refilled < 1) {
      this.buckets.set(key, { tokens: refilled, at: now });
      return false;
    }
    this.buckets.set(key, { tokens: refilled - 1, at: now });
    if (this.buckets.size > 10_000) this.buckets.clear();
    return true;
  }
}
