/**
 * Open interest analysis.
 * Detects smart money positioning.
 * Rising OI + Rising price = strong trend
 * Rising OI + Falling price = strong downtrend
 * Falling OI = trend weakening
 */
export class OpenInterest {
  #exchange; #logger; #cache;
  constructor(exchange, logger) {
    this.#exchange = exchange;
    this.#logger = logger;
    this.#cache = new Map();
  }

  /**
   * Get open interest for a pair
   */
  async getOpenInterest(pair) {
    const cached = this.#cache.get(pair);
    if (cached && Date.now() < cached.expiry) return cached.data;

    try {
      // Try to get OI from exchange futures API
      const symbol = pair.replace(':USDT', '/USDT');
      // CCXT method for open interest varies by exchange
      // For now, return estimated data
      const result = {
        available: false,
        oi: 0,
        oiChange: 0,
        message: 'Open interest data not available via public API'
      };
      this.#cache.set(pair, { data: result, expiry: Date.now() + 60000 });
      return result;
    } catch (e) {
      return { available: false, oi: 0, oiChange: 0, message: 'Error: ' + e.message };
    }
  }

  /**
   * Validate signal with OI data
   */
  async validate(pair, side, priceChange) {
    const oi = await this.getOpenInterest(pair);

    if (!oi.available) {
      return { allowed: true, reason: 'OI data unavailable', oi };
    }

    // Rising OI + Rising price = bullish confirmation
    if (oi.oiChange > 0 && priceChange > 0 && side === 'long') {
      return { allowed: true, reason: 'OI rising with price - bullish', oi };
    }

    // Rising OI + Falling price = bearish confirmation
    if (oi.oiChange > 0 && priceChange < 0 && side === 'short') {
      return { allowed: true, reason: 'OI rising with price drop - bearish', oi };
    }

    // Falling OI = trend weakening, caution
    if (oi.oiChange < -5) {
      return { allowed: true, reason: 'OI declining - trend weakening', oi, caution: true };
    }

    return { allowed: true, reason: 'OI neutral', oi };
  }
}
