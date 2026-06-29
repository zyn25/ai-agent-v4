/**
 * Rate limit protection.
 * Required by master prompt: "Respect exchange rate limits"
 * Tracks API calls and enforces limits.
 */
export class RateLimiter {
  #calls = [];
  #windowMs;
  #maxCalls;
  #logger;

  constructor(maxCalls = 1200, windowMs = 60000, logger) {
    this.#maxCalls = maxCalls;
    this.#windowMs = windowMs;
    this.#logger = logger;
  }

  /**
   * Check if we can make a call
   * @returns { allowed: boolean, waitMs: number }
   */
  canCall() {
    this.#cleanup();

    if (this.#calls.length >= this.#maxCalls) {
      const oldest = this.#calls[0];
      const waitMs = this.#windowMs - (Date.now() - oldest);
      return { allowed: false, waitMs: Math.max(0, waitMs) };
    }

    return { allowed: true, waitMs: 0 };
  }

  /**
   * Record a call
   */
  record() {
    this.#calls.push(Date.now());
  }

  /**
   * Wait if needed, then record
   */
  async throttle() {
    const check = this.canCall();
    if (!check.allowed) {
      if (this.#logger) {
        this.#logger.warn('Rate limit: waiting ' + check.waitMs + 'ms');
      }
      await new Promise(r => setTimeout(r, check.waitMs));
    }
    this.record();
  }

  /**
   * Get current status
   */
  getStatus() {
    this.#cleanup();
    return {
      calls: this.#calls.length,
      maxCalls: this.#maxCalls,
      remaining: this.#maxCalls - this.#calls.length,
      windowMs: this.#windowMs
    };
  }

  #cleanup() {
    const cutoff = Date.now() - this.#windowMs;
    this.#calls = this.#calls.filter(t => t > cutoff);
  }
}
