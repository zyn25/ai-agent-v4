/**
 * Pair rotation - focus on best performing pairs.
 * Reduces exposure to underperforming pairs.
 */
export class PairRotation {
  #config; #logger; #db;
  constructor(config, logger, db) { this.#config = config; this.#logger = logger; this.#db = db; }

  /**
   * Get pair ranking based on recent performance
   * @returns {Array} Pairs sorted by performance
   */
  getRanking() {
    const pairs = this.#config.pairs;
    const ranking = [];

    for (const pair of pairs) {
      const trades = this.#db.prepare(
        "SELECT * FROM positions WHERE status='closed' AND pair = ? ORDER BY close_time DESC LIMIT 20"
      ).all(pair);

      const wins = trades.filter(t => t.pnl > 0).length;
      const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
      const winRate = trades.length > 0 ? wins / trades.length : 0;

      ranking.push({
        pair,
        trades: trades.length,
        wins,
        winRate: (winRate * 100).toFixed(1),
        totalPnl: totalPnl.toFixed(2),
        score: (winRate * 50) + (totalPnl > 0 ? 25 : -25) + (trades.length >= 5 ? 25 : 0),
      });
    }

    ranking.sort((a, b) => b.score - a.score);
    return ranking;
  }

  /**
   * Should we skip this pair?
   */
  shouldSkip(pair) {
    const ranking = this.#getRankingMap();
    const pairData = ranking.get(pair);
    if (!pairData) return false;

    // Skip if win rate < 20% with enough trades
    if (pairData.trades >= 10 && parseFloat(pairData.winRate) < 20) {
      this.#logger.trade('Pair rotation: skipping ' + pair + ' (WR: ' + pairData.winRate + '%)');
      return true;
    }

    // Skip if total PnL deeply negative with enough trades
    if (pairData.trades >= 10 && parseFloat(pairData.totalPnl) < -100) {
      this.#logger.trade('Pair rotation: skipping ' + pair + ' (PnL: $' + pairData.totalPnl + ')');
      return true;
    }

    return false;
  }

  #getRankingMap() {
    const pairs = this.#config.pairs;
    const map = new Map();
    for (const pair of pairs) {
      const trades = this.#db.prepare(
        "SELECT * FROM positions WHERE status='closed' AND pair = ? ORDER BY close_time DESC LIMIT 20"
      ).all(pair);
      const wins = trades.filter(t => t.pnl > 0).length;
      map.set(pair, {
        trades: trades.length,
        wins,
        winRate: trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0.0',
        totalPnl: trades.reduce((s, t) => s + t.pnl, 0).toFixed(2),
      });
    }
    return map;
  }
}
