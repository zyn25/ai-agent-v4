/**
 * Pullback filter.
 * Only enters when price pulls back to support/resistance.
 * Prevents buying at top / selling at bottom.
 */
export class PullbackFilter {
  #logger;
  constructor(logger) { this.#logger = logger; }

  /**
   * Check if price is at a good entry level
   * @param {Array} closes - Close prices
   * @param {Array} highs - High prices
   * @param {Array} lows - Low prices
   * @param {string} side - 'long' or 'short'
   * @returns {object} { valid: boolean, reason: string }
   */
  check(closes, highs, lows, side) {
    if (!closes || closes.length < 20) {
      return { valid: true, reason: 'Insufficient data' };
    }

    const current = closes[closes.length - 1];
    const recent20 = closes.slice(-20);
    const recent5 = closes.slice(-5);

    if (side === 'long') {
      // Check if price pulled back from recent high
      const recentHigh = Math.max(...recent20);
      const pullback = (recentHigh - current) / recentHigh;

      // Check if last 3 candles show reversal (lower wicks = buying pressure)
      const last3 = recent5.slice(-3);
      const hasLowerWick = this.#checkLowerWick(last3, lows.slice(-3));

      // Pullback between 0.3% and 2% is ideal for long entry
      if (pullback < 0.001) {
        return { valid: false, reason: 'No pullback from high (too close to top)' };
      }

      if (pullback > 0.05) {
        return { valid: false, reason: 'Pullback too deep (>5%, trend may be broken)' };
      }

      return {
        valid: true,
        reason: 'Pullback ' + (pullback * 100).toFixed(2) + '% from high',
        pullback,
        hasReversal: hasLowerWick,
      };
    }

    if (side === 'short') {
      const recentLow = Math.min(...recent20);
      const pullback = (current - recentLow) / recentLow;

      const last3 = recent5.slice(-3);
      const hasUpperWick = this.#checkUpperWick(last3, highs.slice(-3));

      if (pullback < 0.001) {
        return { valid: false, reason: 'No pullback from low (too close to bottom)' };
      }

      if (pullback > 0.05) {
        return { valid: false, reason: 'Pullback too deep (>5%, trend may be broken)' };
      }

      return {
        valid: true,
        reason: 'Pullback ' + (pullback * 100).toFixed(2) + '% from low',
        pullback,
        hasReversal: hasUpperWick,
      };
    }

    return { valid: false, reason: 'Invalid side' };
  }

  #checkLowerWick(closes, lows) {
    let count = 0;
    for (let i = 0; i < closes.length; i++) {
      const body = Math.abs(closes[i] - (closes[i - 1] || closes[i]));
      const lowerWick = Math.min(closes[i], closes[i - 1] || closes[i]) - lows[i];
      if (lowerWick > body * 0.5) count++;
    }
    return count >= 1;
  }

  #checkUpperWick(closes, highs) {
    let count = 0;
    for (let i = 0; i < closes.length; i++) {
      const body = Math.abs(closes[i] - (closes[i - 1] || closes[i]));
      const upperWick = highs[i] - Math.max(closes[i], closes[i - 1] || closes[i]);
      if (upperWick > body * 0.5) count++;
    }
    return count >= 1;
  }
}
