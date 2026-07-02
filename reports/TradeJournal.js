import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class TradeJournal {
  #db; #logger; #exportDir;

  constructor(database, logger) {
    this.#db = database;
    this.#logger = logger;
    this.#exportDir = join(process.cwd(), 'storage', 'exports');
    if (!existsSync(this.#exportDir)) mkdirSync(this.#exportDir, { recursive: true });
  }

  exportToCSV(days = 30) {
    // FIX: Get all trades then filter in JavaScript
    const allTrades = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC"
    ).all();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().substring(0, 19);

    const trades = allTrades.filter(t => {
      if (!t.close_time) return false;
      return t.close_time >= cutoffStr;
    });

    if (!trades.length) return null;

    const headers = [
      'id', 'pair', 'side', 'entry_price', 'exit_price', 'quantity',
      'leverage', 'stop_loss', 'take_profit', 'pnl', 'roi', 'fees',
      'slippage', 'exit_reason', 'ai_confidence', 'ai_decision',
      'open_time', 'close_time', 'hold_duration'
    ];

    let csv = headers.join(',') + '\n';

    for (const t of trades) {
      const row = headers.map(h => {
        const val = t[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return '"' + val + '"';
        return val;
      });
      csv += row.join(',') + '\n';
    }

    const filename = 'trades_' + new Date().toISOString().substring(0, 10) + '.csv';
    const filepath = join(this.#exportDir, filename);
    writeFileSync(filepath, csv);

    this.#logger.info('Trade journal exported: ' + filepath);
    return { filepath, count: trades.length };
  }

  getPerformanceSummary(days = 30) {
    const allTrades = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC"
    ).all();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().substring(0, 19);

    const trades = allTrades.filter(t => {
      if (!t.close_time) return false;
      return t.close_time >= cutoffStr;
    });

    if (!trades.length) return null;

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const pnls = trades.map(t => t.pnl);
    const totalPnl = pnls.reduce((s, p) => s + p, 0);
    const avgPnl = totalPnl / trades.length;

    const mean = avgPnl;
    const variance = pnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;

    const negativePnls = pnls.filter(p => p < 0);
    const downsideVariance = negativePnls.length > 0
      ? negativePnls.reduce((s, p) => s + Math.pow(p, 2), 0) / negativePnls.length
      : 0;
    const downsideDev = Math.sqrt(downsideVariance);
    const sortino = downsideDev > 0 ? (mean / downsideDev) * Math.sqrt(252) : 0;

    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    let peak = 0, maxDD = 0, running = 0;
    for (const pnl of pnls) {
      running += pnl;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    }

    const best = Math.max(...pnls);
    const worst = Math.min(...pnls);
    const avgHold = trades.reduce((s, t) => s + (t.hold_duration || 0), 0) / trades.length;
    const avgHoldHours = avgHold / 3600000;

    let maxWinStreak = 0, maxLossStreak = 0, currentWin = 0, currentLoss = 0;
    for (const t of [...trades].reverse()) {
      if (t.pnl > 0) { currentWin++; currentLoss = 0; maxWinStreak = Math.max(maxWinStreak, currentWin); }
      else { currentLoss++; currentWin = 0; maxLossStreak = Math.max(maxLossStreak, currentLoss); }
    }

    const byPair = {};
    for (const t of trades) {
      if (!byPair[t.pair]) byPair[t.pair] = { trades: 0, wins: 0, pnl: 0 };
      byPair[t.pair].trades++;
      if (t.pnl > 0) byPair[t.pair].wins++;
      byPair[t.pair].pnl += t.pnl;
    }

    const byReason = {};
    for (const t of trades) {
      if (!byReason[t.exit_reason]) byReason[t.exit_reason] = { count: 0, pnl: 0 };
      byReason[t.exit_reason].count++;
      byReason[t.exit_reason].pnl += t.pnl;
    }

    return {
      period: days + ' days',
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: ((wins.length / trades.length) * 100).toFixed(1),
      totalPnl: totalPnl.toFixed(2),
      avgPnl: avgPnl.toFixed(2),
      avgWin: wins.length ? (grossProfit / wins.length).toFixed(2) : '0',
      avgLoss: losses.length ? (grossLoss / losses.length).toFixed(2) : '0',
      bestTrade: best.toFixed(2),
      worstTrade: worst.toFixed(2),
      payoffRatio: grossLoss > 0 ? (grossProfit / wins.length) / (grossLoss / losses.length) : 0,
      profitFactor: profitFactor.toFixed(2),
      sharpeRatio: sharpe.toFixed(2),
      sortinoRatio: sortino.toFixed(2),
      maxDrawdown: maxDD.toFixed(2),
      maxDrawdownPct: peak > 0 ? ((maxDD / peak) * 100).toFixed(2) : '0',
      maxWinStreak,
      maxLossStreak,
      grossProfit: grossProfit.toFixed(2),
      grossLoss: grossLoss.toFixed(2),
      bestHour: 'N/A',
      avgHoldHours: isNaN(avgHoldHours) ? '0.0' : avgHoldHours.toFixed(1),
      expectancy: avgPnl.toFixed(2),
      byPair,
      byReason
    };
  }
}
