/**
 * Advanced performance analytics.
 * Tracks all key metrics automatically.
 */
export class PerformanceAnalytics {
  #db; #logger;
  constructor(database, logger) { this.#db = database; this.#logger = logger; }

  /**
   * Get comprehensive performance report
   */
  getReport(days = 30) {
    const trades = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' AND close_time >= datetime('now', '-' + ? + ' days') ORDER BY close_time ASC"
    ).all(days);

    if (!trades.length) return this.#emptyReport(days);

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const pnls = trades.map(t => t.pnl);
    const totalPnl = pnls.reduce((s, p) => s + p, 0);

    // Basic metrics
    const winRate = (wins.length / trades.length * 100);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Profit Factor
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Expectancy
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    // Sharpe Ratio
    const mean = totalPnl / trades.length;
    const variance = pnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;

    // Sortino Ratio
    const negPnls = pnls.filter(p => p < 0);
    const downVar = negPnls.length ? negPnls.reduce((s, p) => s + p * p, 0) / negPnls.length : 0;
    const downDev = Math.sqrt(downVar);
    const sortino = downDev > 0 ? (mean / downDev) * Math.sqrt(252) : 0;

    // Max Drawdown
    let peak = 0, maxDD = 0, maxDDPct = 0, running = 0;
    for (const pnl of pnls) {
      running += pnl;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) { maxDD = dd; maxDDPct = peak > 0 ? (dd / peak * 100) : 0; }
    }

    // Streaks
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    for (const t of trades) {
      if (t.pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
      else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
    }

    // By pair
    const byPair = {};
    for (const t of trades) {
      if (!byPair[t.pair]) byPair[t.pair] = { trades: 0, wins: 0, pnl: 0, best: 0, worst: 0 };
      byPair[t.pair].trades++;
      if (t.pnl > 0) byPair[t.pair].wins++;
      byPair[t.pair].pnl += t.pnl;
      byPair[t.pair].best = Math.max(byPair[t.pair].best, t.pnl);
      byPair[t.pair].worst = Math.min(byPair[t.pair].worst, t.pnl);
    }

    // By reason
    const byReason = {};
    for (const t of trades) {
      if (!byReason[t.exit_reason]) byReason[t.exit_reason] = { count: 0, pnl: 0 };
      byReason[t.exit_reason].count++;
      byReason[t.exit_reason].pnl += t.pnl;
    }

    // By hour
    const byHour = {};
    for (const t of trades) {
      const hour = new Date(t.open_time).getUTCHours();
      if (!byHour[hour]) byHour[hour] = { trades: 0, wins: 0, pnl: 0 };
      byHour[hour].trades++;
      if (t.pnl > 0) byHour[hour].wins++;
      byHour[hour].pnl += t.pnl;
    }

    // Best trading hour
    let bestHour = 0, bestHourPnl = -Infinity;
    for (const [h, data] of Object.entries(byHour)) {
      if (data.pnl > bestHourPnl) { bestHourPnl = data.pnl; bestHour = h; }
    }

    // Calmar Ratio
    const portfolio = this.#db.prepare('SELECT balance FROM portfolio ORDER BY id DESC LIMIT 1').get();
    const calmar = maxDDPct > 0 ? ((totalPnl / (portfolio?.balance || 10000)) * 100) / maxDDPct : 0;

    // Recovery Factor
    const recoveryFactor = maxDD > 0 ? totalPnl / maxDD : 0;

    return {
      period: days + ' days',
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1),
      totalPnl: totalPnl.toFixed(2),
      avgPnl: (totalPnl / trades.length).toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      bestTrade: Math.max(...pnls).toFixed(2),
      worstTrade: Math.min(...pnls).toFixed(2),
      payoffRatio: payoffRatio.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      expectancy: expectancy.toFixed(2),
      sharpeRatio: sharpe.toFixed(2),
      sortinoRatio: sortino.toFixed(2),
      calmarRatio: calmar.toFixed(2),
      recoveryFactor: recoveryFactor.toFixed(2),
      maxDrawdown: maxDD.toFixed(2),
      maxDrawdownPct: maxDDPct.toFixed(2),
      maxWinStreak,
      maxLossStreak,
      grossProfit: grossProfit.toFixed(2),
      grossLoss: grossLoss.toFixed(2),
      bestHour: bestHour + ':00 UTC',
      avgHoldHours: (trades.reduce((s, t) => s + (t.hold_duration || 0), 0) / trades.length / 3600000).toFixed(1),
      byPair,
      byReason,
      byHour
    };
  }

  #emptyReport(days) {
    return {
      period: days + ' days',
      totalTrades: 0, wins: 0, losses: 0, winRate: '0.0',
      totalPnl: '0.00', message: 'No trades in this period'
    };
  }
}
