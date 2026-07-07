/**
 * Smart cooldown that adjusts based on market conditions.
 * Reduces trading in bad conditions, increases in good conditions.
 */
export class SmartCooldown {
  #config; #logger; #db;
  constructor(config, logger, db) { this.#config = config; this.#logger = logger; this.#db = db; }

  /**
   * Get cooldown in milliseconds based on recent performance
   * @returns {number} Cooldown in ms
   */
  getCooldown() {
    const baseCooldown = this.#config.risk.cooldownMinutes * 60000;
    const recentTrades = this.#db.prepare(
      "SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 5"
    ).all();

    if (!recentTrades.length) return baseCooldown;

    const recentWins = recentTrades.filter(t => t.pnl > 0).length;
    const recentLosses = recentTrades.filter(t => t.pnl <= 0).length;

    // After 3+ consecutive losses: double cooldown
    if (recentLosses >= 3) {
      return baseCooldown * 2;
    }

    // After 3+ consecutive wins: reduce cooldown by 25%
    if (recentWins >= 3) {
      return baseCooldown * 0.75;
    }

    // After big loss (> 2%): triple cooldown
    const lastTrade = recentTrades[0];
    const portfolio = this.#db.prepare('SELECT balance FROM portfolio ORDER BY id DESC LIMIT 1').get();
    if (lastTrade && portfolio && portfolio.balance > 0 && lastTrade.pnl < 0) {
      const lossPct = Math.abs(lastTrade.pnl / portfolio.balance) * 100;
      if (lossPct > 2) {
        this.#logger.trade('Smart cooldown: big loss detected (' + lossPct.toFixed(1) + '%), triple cooldown');
        return baseCooldown * 3;
      }
    }

    return baseCooldown;
  }
}
