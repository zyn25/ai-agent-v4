export class MarketDataService {
  #exchange; #config; #logger; #cache = new Map(); #cacheTTL = 30000;
  constructor(exchange, config, logger) { this.#exchange = exchange; this.#config = config; this.#logger = logger; }

  async fetchOHLCV(pair, timeframe, limit = 200) {
    const k = pair + '_' + timeframe + '_' + limit;
    const c = this.#cache.get(k);
    if (c && Date.now() < c.expiry) return c.data;
    try {
      const d = await this.#exchange.fetchOHLCV(pair, timeframe, undefined, limit);
      this.#cache.set(k, { data: d, expiry: Date.now() + this.#cacheTTL });
      return d;
    } catch (e) { this.#logger.error('OHLCV ' + pair + ' ' + timeframe + ': ' + e.message); throw e; }
  }

  async fetchTicker(pair) {
    const k = 'ticker_' + pair;
    const c = this.#cache.get(k);
    if (c && Date.now() < c.expiry) return c.data;
    try {
      const t = await this.#exchange.fetchTicker(pair);
      this.#cache.set(k, { data: t, expiry: Date.now() + 5000 });
      return t;
    } catch (e) { this.#logger.error('Ticker ' + pair + ': ' + e.message); throw e; }
  }

  async fetchAllTickers() {
    const results = {};
    for (const pair of this.#config.pairs) {
      try {
        const ticker = await this.fetchTicker(pair);
        results[pair] = ticker;
      } catch (e) { this.#logger.warn('Skip ' + pair + ': ' + e.message); }
    }
    return results;
  }

  clearCache() { this.#cache.clear(); }
}
