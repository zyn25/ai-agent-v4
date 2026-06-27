export class MarketDataService {
  #exchange; #config; #logger; #cache = new Map();
  constructor(exchange, config, logger) { this.#exchange = exchange; this.#config = config; this.#logger = logger; }
  async fetchOHLCV(tf, limit = 200) {
    const k = `ohlcv_${tf}_${limit}`;
    const c = this.#cache.get(k);
    if (c && Date.now() < c.expiry) return c.data;
    const d = await this.#exchange.fetchOHLCV(this.#config.exchange.pair, tf, undefined, limit);
    this.#cache.set(k, { data: d, expiry: Date.now() + 30000 });
    return d;
  }
  async fetchTicker() {
    const c = this.#cache.get('ticker');
    if (c && Date.now() < c.expiry) return c.data;
    const t = await this.#exchange.fetchTicker(this.#config.exchange.pair);
    this.#cache.set('ticker', { data: t, expiry: Date.now() + 5000 });
    return t;
  }
  clearCache() { this.#cache.clear(); }
}
