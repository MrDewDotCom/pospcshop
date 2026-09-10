// In-memory throttle for login and recovery attempts: after `maxFailures` failures within
// `windowMs` for the same key (username + IP), further attempts are refused until the window passes.

export interface ThrottleCheck {
  allowed: boolean;
  retryAfterMs: number;
}

export class LoginThrottle {
  readonly #failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 5 * 60 * 1000,
  ) {}

  #recent(key: string, now: number): number[] {
    const recent = (this.#failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length) this.#failures.set(key, recent);
    else this.#failures.delete(key);
    return recent;
  }

  check(key: string, now = Date.now()): ThrottleCheck {
    const recent = this.#recent(key, now);
    if (recent.length < this.maxFailures) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: recent[0]! + this.windowMs - now };
  }

  recordFailure(key: string, now = Date.now()): void {
    this.#failures.set(key, [...this.#recent(key, now), now]);
  }

  reset(key: string): void {
    this.#failures.delete(key);
  }
}
