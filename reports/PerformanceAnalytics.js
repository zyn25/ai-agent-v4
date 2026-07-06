export class PerformanceAnalytics {
  #db; #logger;
  constructor(database, logger) { this.#db = database; this.#logger = logger; }

  getReport(days = 30) {
    const trades = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC"
    ).all();

    if (!trades.length) return this.#emptyReport(days);

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const pnls = trades.map(t => t.pnl);
    const totalPnl = pnls.reduce((s, p) => s + p, 0);

    const winRate = (wins.length / trades.length * 100);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    const p = this.#db.prepare('SELECT balance FROM portfolio ORDER BY id ASC LIMIT 1').get();
    const startingBalance = p ? p.balance : 10000;
    let peak = startingBalance;
    let maxDD = 0;
    let maxDDPct = 0;
    let running = startingBalance;

    for (const pnl of pnls) {
      running += pnl;
      if (running > peak) peak = running;
      const dd = peak - running;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (ddPct > maxDDPct) {
        maxDD = dd;
        maxDDPct = ddPct;
      }
    }

    // Sharpe
    const mean = totalPnl / trades.length;
    const variance = pnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;

    // Sortino
    const negPnls = pnls.filter(p => p < 0);
    const downVar = negPnls.length ? negPnls.reduce((s, p) => s + p * p, 0) / negPnls.length : 0;
    const downDev = Math.sqrt(downVar);
    const sortino = downDev > 0 ? (mean / downDev) * Math.sqrt(252) : 0;

    // Streaks
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    for (const t of [...trades].reverse()) {
      if (t.pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
      else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
    }

    const avgHold = trades.reduce((s, t) => s + (t.hold_duration || 0), 0) / trades.length;
    const avgHoldHours = avgHold / 3600000;

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
      sharpeRatio: sharpe.toFixed(2),
      sortinoRatio: sortino.toFixed(2),
      maxDrawdown: maxDD.toFixed(2),
      maxDrawdownPct: maxDDPct.toFixed(2),
      maxWinStreak,
      maxLossStreak,
      grossProfit: grossProfit.toFixed(2),
      grossLoss: grossLoss.toFixed(2),
      bestHour: 'N/A',
      avgHoldHours: isNaN(avgHoldHours) ? '0.0' : avgHoldHours.toFixed(1),
      expectancy: (totalPnl / trades.length).toFixed(2),
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
