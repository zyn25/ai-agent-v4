/**
 * Trade scoring system.
 * Scores each trade for learning and improvement.
 */
export class TradeScorer {
  #db; #logger;
  constructor(database, logger) { this.#db = database; this.#logger = logger; }

  /**
   * Score a closed trade (0-100)
   */
  score(trade) {
    let score = 50;

    // PnL contribution
    if (trade.pnl > 0) score += 20;
    else score -= 20;

    // Hold time (ideal: 1-8 hours)
    const holdHours = (trade.hold_duration || 0) / 3600000;
    if (holdHours >= 1 && holdHours <= 8) score += 10;
    else if (holdHours < 0.25) score -= 10;
    else if (holdHours > 12) score -= 5;

    // Exit reason quality
    if (trade.exit_reason === 'take_profit') score += 15;
    else if (trade.exit_reason === 'trailing_stop' && trade.pnl > 0) score += 10;
    else if (trade.exit_reason === 'stop_loss') score -= 10;
    else if (trade.exit_reason === 'max_hold') score -= 5;

    // ROI quality
    if (trade.roi > 2) score += 10;
    else if (trade.roi > 1) score += 5;
    else if (trade.roi < -2) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get trade analysis summary
   */
  analyze() {
    const trades = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 50"
    ).all();

    if (!trades.length) return null;

    const scored = trades.map(t => ({ ...t, score: this.score(t) }));
    const avgScore = scored.reduce((s, t) => s + t.score, 0) / scored.length;

    // Best exit reason
    const byReason = {};
    for (const t of scored) {
      if (!byReason[t.exit_reason]) byReason[t.exit_reason] = { count: 0, totalScore: 0, totalPnl: 0 };
      byReason[t.exit_reason].count++;
      byReason[t.exit_reason].totalScore += t.score;
      byReason[t.exit_reason].totalPnl += t.pnl;
    }

    // Best pair
    const byPair = {};
    for (const t of scored) {
      if (!byPair[t.pair]) byPair[t.pair] = { count: 0, wins: 0, totalScore: 0, totalPnl: 0 };
      byPair[t.pair].count++;
      byPair[t.pair].totalScore += t.score;
      byPair[t.pair].totalPnl += t.pnl;
      if (t.pnl > 0) byPair[t.pair].wins++;
    }

    // Best hour
    const byHour = {};
    for (const t of scored) {
      const hour = new Date(t.open_time).getUTCHours();
      if (!byHour[hour]) byHour[hour] = { count: 0, wins: 0, totalPnl: 0 };
      byHour[hour].count++;
      byHour[hour].totalPnl += t.pnl;
      if (t.pnl > 0) byHour[hour].wins++;
    }

    let bestHour = 0, bestHourPnl = -Infinity;
    for (const [h, d] of Object.entries(byHour)) {
      if (d.totalPnl > bestHourPnl) { bestHourPnl = d.totalPnl; bestHour = h; }
    }

    return {
      totalTrades: scored.length,
      avgScore: avgScore.toFixed(1),
      bestScore: Math.max(...scored.map(t => t.score)),
      worstScore: Math.min(...scored.map(t => t.score)),
      byReason,
      byPair,
      bestHour: bestHour + ':00 UTC',
    };
  }
}
