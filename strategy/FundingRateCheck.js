/**
 * Funding rate check.
 * Avoids trading when funding rate is extreme.
 * Extreme positive = too many longs (short bias)
 * Extreme negative = too many shorts (long bias)
 */
export class FundingRateCheck {
  #exchange; #logger; #cache; #cacheTTL;
  #highThreshold;
  #lowThreshold;

  constructor(exchange, logger, config = {}) {
    this.#exchange = exchange;
    this.#logger = logger;
    this.#cache = new Map();
    this.#cacheTTL = config.cacheTTLMs ?? 300000; // 5 menit default
    this.#highThreshold = config.highFundingThreshold ?? 0.001;  // 0.1%
    this.#lowThreshold = config.lowFundingThreshold ?? -0.001;   // -0.1%
  }

  /**
   * Normalisasi pair ke format simbol exchange.
   * Handle: "BTC/USDT", "BTC/USDT:USDT", "BTCUSDT", "BTC/USDC"
   */
  #normalizeSymbol(pair) {
    if (!pair || typeof pair !== 'string') return '';

    // Hapus suffix ":USDT" / ":USDC" dll
    let symbol = pair.replace(/:\w+$/, '');

    // Kalau sudah format "BASE/QUOTE", pertahankan
    if (symbol.includes('/')) return symbol;

    // Format "BASEQUOTE" → coba ubah ke "BASE/QUOTE"
    const commonQuotes = ['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'BTC', 'ETH', 'BNB'];
    for (const quote of commonQuotes) {
      if (symbol.endsWith(quote) && symbol.length > quote.length) {
        const base = symbol.slice(0, symbol.length - quote.length);
        return base + '/' + quote;
      }
    }

    // Fallback: return apa adanya
    return symbol;
  }

  /**
   * Get funding rate for a pair
   * @returns {{ rate: number, ratePercent: number, nextTime: number|null, available: boolean }}
   */
  async getFundingRate(pair) {
    // Cek cache
    const cached = this.#cache.get(pair);
    if (cached && Date.now() < cached.expiry) return cached.data;

    const symbol = this.#normalizeSymbol(pair);

    try {
      const funding = await this.#exchange.fetchFundingRate(symbol);

      // Validasi response
      if (!funding || funding.fundingRate == null) {
        const result = {
          rate: 0,
          ratePercent: 0,
          nextTime: null,
          available: false,
        };
        this.#cache.set(pair, { data: result, expiry: Date.now() + this.#cacheTTL });
        this.#logger.debug('FundingRateCheck: Funding rate not available for ' + symbol);
        return result;
      }

      const rate = funding.fundingRate;
      const result = {
        rate,
        ratePercent: parseFloat((rate * 100).toFixed(4)), // number, bukan string
        nextTime: funding.fundingTimestamp ?? funding.nextFundingTime ?? null,
        available: true,
      };

      this.#cache.set(pair, { data: result, expiry: Date.now() + this.#cacheTTL });
      this.#logger.debug('FundingRateCheck: ' + symbol + ' rate=' + result.ratePercent + '%');
      return result;

    } catch (e) {
      this.#logger.warn('FundingRateCheck: Gagal fetch funding rate untuk ' + symbol + ': ' + e.message);

      // Return default dengan flag available=false
      const result = {
        rate: 0,
        ratePercent: 0,
        nextTime: null,
        available: false,
      };

      // Tetap cache (lebih singkat) supaya tidak spam retry
      this.#cache.set(pair, { data: result, expiry: Date.now() + this.#cacheTTL });
      return result;
    }
  }

  /**
   * Check if funding rate blocks the trade
   * @param {string} pair - Pair yang akan ditrade
   * @param {'long'|'short'} side - Arah trade
   * @returns {{ allowed: boolean, reason: string, funding: object }}
   */
  async check(pair, side) {
    // Validasi input
    if (!pair || (side !== 'long' && side !== 'short')) {
      return {
        allowed: false,
        reason: 'Invalid input: pair=' + pair + ' side=' + side,
        funding: { rate: 0, ratePercent: 0, nextTime: null, available: false },
      };
    }

    const funding = await this.getFundingRate(pair);

    // Kalau funding rate tidak tersedia, izinkan dengan caution
    if (!funding.available) {
      return {
        allowed: true,
        reason: 'Funding rate not available, allowing by default',
        funding,
        caution: true,
      };
    }

    const rate = funding.rate;

    // Extreme positive funding = too many longs → jangan long
    if (rate > this.#highThreshold && side === 'long') {
      return {
        allowed: false,
        reason: 'High funding rate (' + funding.ratePercent + '% > ' + (this.#highThreshold * 100) + '%) - too many longs',
        funding,
      };
    }

    // Extreme negative funding = too many shorts → jangan short
    if (rate < this.#lowThreshold && side === 'short') {
      return {
        allowed: false,
        reason: 'Negative funding rate (' + funding.ratePercent + '% < ' + (this.#lowThreshold * 100) + '%) - too many shorts',
        funding,
      };
    }

    // Boleh trade, tapi kasih warning kalau mendekati threshold
    const caution = (side === 'long' && rate > this.#highThreshold * 0.7) ||
                    (side === 'short' && rate < this.#lowThreshold * 0.7);

    return {
      allowed: true,
      reason: caution
        ? 'Funding approaching threshold (' + funding.ratePercent + '%)'
        : 'Funding OK (' + funding.ratePercent + '%)',
      funding,
      caution,
    };
  }

  /**
   * Clear cache (untuk testing atau reset)
   */
  clearCache() {
    this.#cache.clear();
    this.#logger.debug('FundingRateCheck: Cache cleared');
  }
}
