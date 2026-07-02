/**
 * Funding rate check.
 * Avoids trading when funding rate is extreme.
 * Extreme positive = too many longs (short bias)
 * Extreme negative = too many shorts (long bias)
 */
export class FundingRateCheck {
  #exchange; #logger; #cache; #cacheTTL;
  constructor(exchange, logger) {
    this.#exchange = exchange;
    this.#logger = logger;
    this.#cache = new Map();
    this.#cacheTTL = 300000; // 5 minutes
  }

  /**
   * Get funding rate for a pair
   */
  async getFundingRate(pair) {
    const cached = this.#cache.get(pair);
    if (cached && Date.now() < cached.expiry) return cached.data;

    try {
      // Try to get funding rate from exchange
      const symbol = pair.replace(':USDT', '');
      const funding = await this.#exchange.fetchFundingRate(symbol);
      const result = {
        rate: funding.fundingRate || 0,
        ratePercent: ((funding.fundingRate || 0) * 100).toFixed(4),
        nextTime: funding.fundingTimestamp,
      };
      this.#cache.set(pair, { data: result, expiry: Date.now() + this.#cacheTTL });
      return result;
    } catch (e) {
      // Funding rate not available
      return { rate: 0, ratePercent: '0.0000', nextTime: null };
    }
  }

  /**
   * Check if funding rate blocks the trade
   * @returns {object} { allowed: boolean, reason: string }
   */
  async check(pair, side) {
    const funding = await this.getFundingRate(pair);
    const rate = funding.rate;

    // Extreme positive funding (>0.1%) = too many longs
    if (rate > 0.001 && side === 'long') {
      return { allowed: false, reason: 'High funding rate (' + funding.ratePercent + '%) - too many longs', funding };
    }

    // Extreme negative funding (<-0.1%) = too many shorts
    if (rate < -0.001 && side === 'short') {
      return { allowed: false, reason: 'Negative funding rate (' + funding.ratePercent + '%) - too many shorts', funding };
    }

    return { allowed: true, reason: 'Funding OK (' + funding.ratePercent + '%)', funding };
  }
}
