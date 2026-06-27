export class CircuitBreaker {
  #config; #logger; #database; #paused = false; #reason = '';
  constructor(config, logger, db) { this.#config = config; this.#logger = logger; this.#database = db; }
  async check() {
    if (this.#paused) return { allowed: false, reason: this.#reason };
    const p = this.#database.db.prepare('SELECT * FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if (!p) return { allowed: true };
    if (p.daily_pnl < 0 && Math.abs(p.daily_pnl / p.balance) * 100 >= this.#config.risk.maxDailyLoss) { this.#pause('Daily loss limit'); return { allowed: false, reason: 'Daily loss limit' }; }
    return { allowed: true };
  }
  async recordLoss() {}
  #pause(r) { this.#paused = true; this.#reason = r; this.#logger.warn(`Circuit breaker: ${r}`); }
}
