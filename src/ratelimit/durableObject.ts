// ---------------------------------------------------------------------------
// Rate Limiter — Durable Object
//
// Single DO per rate-limit key (IP or API key name).
// Uses a sliding window counter with atomic in-memory state +
// periodic alarm-based cleanup.
//
// Pricing advantage over KV:
//   KV: ~$5.50/M requests (read + write per check)
//   DO: ~$0.15/M requests (single fetch per check)
// ---------------------------------------------------------------------------

interface RateLimitState {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

export class RateLimiterDO implements DurableObject {
  private state: DurableObjectState;
  private timestamps: number[] = [];
  private initialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async init() {
    if (this.initialized) return;
    const stored = await this.state.storage.get<RateLimitState>('data');
    this.timestamps = stored?.timestamps ?? [];
    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.init();

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);
    const windowMs = parseInt(url.searchParams.get('window') ?? '3600000', 10); // default 1hr

    const now = Date.now();
    const windowStart = now - windowMs;

    // Prune expired timestamps (sliding window)
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    const remaining = Math.max(0, limit - this.timestamps.length);
    const allowed = this.timestamps.length < limit;

    if (allowed) {
      this.timestamps.push(now);
    }

    // Persist state (batched by the DO runtime for efficiency)
    await this.state.storage.put<RateLimitState>('data', {
      timestamps: this.timestamps,
    });

    // Schedule cleanup alarm if we have timestamps
    if (this.timestamps.length > 0 && !await this.state.storage.getAlarm()) {
      await this.state.storage.setAlarm(now + windowMs + 1000);
    }

    return new Response(JSON.stringify({
      allowed,
      remaining,
      limit,
      count: this.timestamps.length,
      resetMs: this.timestamps.length > 0
        ? this.timestamps[0] + windowMs - now
        : 0,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Alarm cleans up expired state to free DO memory */
  async alarm(): Promise<void> {
    await this.init();
    const windowMs = 3600000; // 1hr
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => t > now - windowMs);

    if (this.timestamps.length === 0) {
      // No active rate limits — clean up storage
      await this.state.storage.deleteAll();
      this.initialized = false;
    } else {
      await this.state.storage.put<RateLimitState>('data', {
        timestamps: this.timestamps,
      });
      // Re-schedule alarm
      await this.state.storage.setAlarm(
        this.timestamps[0] + windowMs + 1000,
      );
    }
  }
}
