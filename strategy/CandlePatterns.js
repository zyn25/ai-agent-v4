/**
 * Candle pattern recognition.
 * Confirms entry with price action patterns.
 */
export class CandlePatterns {
  #logger;
  constructor(logger) { this.#logger = logger; }

  /**
   * Analyze last candles for patterns
   * @returns {object} { pattern, direction, confidence }
   */
  analyze(closes, highs, lows, opens) {
    if (!closes || closes.length < 5) {
      return { pattern: 'none', direction: 'neutral', confidence: 0 };
    }

    const len = closes.length;

    // Current candle
    const c0 = closes[len - 1];
    const h0 = highs[len - 1];
    const l0 = lows[len - 1];
    const o0 = opens ? opens[len - 1] : closes[len - 2];

    // Previous candle
    const c1 = closes[len - 2];
    const h1 = highs[len - 2];
    const l1 = lows[len - 2];
    const o1 = opens ? opens[len - 2] : closes[len - 3];

    // 2 candles ago
    const c2 = closes[len - 3];

    const patterns = [];

    // 1. Bullish Engulfing
    if (c1 < o1 && c0 > o0 && c0 > o1 && o0 < c1) {
      patterns.push({ pattern: 'bullish_engulfing', direction: 'long', confidence: 80 });
    }

    // 2. Bearish Engulfing
    if (c1 > o1 && c0 < o0 && c0 < o1 && o0 > c1) {
      patterns.push({ pattern: 'bearish_engulfing', direction: 'short', confidence: 80 });
    }

    // 3. Hammer (bullish)
    const body0 = Math.abs(c0 - o0);
    const lowerWick0 = Math.min(c0, o0) - l0;
    const upperWick0 = h0 - Math.max(c0, o0);
    if (lowerWick0 > body0 * 2 && upperWick0 < body0 * 0.3 && c1 < c2) {
      patterns.push({ pattern: 'hammer', direction: 'long', confidence: 70 });
    }

    // 4. Shooting Star (bearish)
    if (upperWick0 > body0 * 2 && lowerWick0 < body0 * 0.3 && c1 > c2) {
      patterns.push({ pattern: 'shooting_star', direction: 'short', confidence: 70 });
    }

    // 5. Doji (indecision)
    if (body0 < (h0 - l0) * 0.1) {
      patterns.push({ pattern: 'doji', direction: 'neutral', confidence: 30 });
    }

    // 6. Three White Soldiers (strong bullish)
    if (closes[len - 3] < closes[len - 2] && closes[len - 2] < closes[len - 1]) {
      const allBullish = closes[len - 3] > (opens ? opens[len - 3] : closes[len - 4]) &&
                         closes[len - 2] > (opens ? opens[len - 2] : closes[len - 3]) &&
                         closes[len - 1] > (opens ? opens[len - 1] : closes[len - 2]);
      if (allBullish) {
        patterns.push({ pattern: 'three_white_soldiers', direction: 'long', confidence: 85 });
      }
    }

    // 7. Three Black Crows (strong bearish)
    if (closes[len - 3] > closes[len - 2] && closes[len - 2] > closes[len - 1]) {
      const allBearish = closes[len - 3] < (opens ? opens[len - 3] : closes[len - 4]) &&
                         closes[len - 2] < (opens ? opens[len - 2] : closes[len - 3]) &&
                         closes[len - 1] < (opens ? opens[len - 1] : closes[len - 2]);
      if (allBearish) {
        patterns.push({ pattern: 'three_black_crows', direction: 'short', confidence: 85 });
      }
    }

    // Return best pattern
    if (patterns.length === 0) {
      return { pattern: 'none', direction: 'neutral', confidence: 0 };
    }

    patterns.sort((a, b) => b.confidence - a.confidence);
    return patterns[0];
  }

  /**
   * Validate if candle pattern confirms the signal direction
   */
  confirm(signalSide, closes, highs, lows, opens) {
    const result = this.analyze(closes, highs, lows, opens);

    if (result.pattern === 'none') {
      return { confirmed: false, reason: 'No candle pattern detected' };
    }

    if (result.direction === 'neutral') {
      return { confirmed: false, reason: 'Indecision candle (doji)' };
    }

    if (result.direction === signalSide) {
      return {
        confirmed: true,
        reason: result.pattern + ' confirms ' + signalSide,
        pattern: result.pattern,
        confidence: result.confidence,
      };
    }

    return {
      confirmed: false,
      reason: result.pattern + ' suggests ' + result.direction + ' (opposite)',
    };
  }
}
