/**
 * Trade review system.
 * Analyzes why trades won or lost.
 */
export class TradeReviewer {
  #db; #logger;
  constructor(database, logger) { this.#db = database; this.#logger = logger; }

  /**
   * Review a specific trade
   */
  review(tradeId) {
    const trade = this.#db.prepare('SELECT * FROM positions WHERE id = ?').get(tradeId);
    if (!trade) return null;

    const analysis = {
      id: trade.id,
      pair: trade.pair,
      side: trade.side,
      entry: trade.entry_price,
      exit: trade.exit_price,
      pnl: trade.pnl,
      roi: trade.roi,
      exitReason: trade.exit_reason,
      holdDuration: trade.hold_duration,
      holdHours: ((trade.hold_duration || 0) / 3600000).toFixed(1),
    };

    // Analyze exit
    if (trade.pnl > 0) {
      analysis.verdict = 'WIN';
      analysis.notes = this.#analyzeWin(trade);
    } else {
      analysis.verdict = 'LOSS';
      analysis.notes = this.#analyzeLoss(trade);
    }

    // Timing analysis
    const hour = new Date(trade.open_time).getUTCHours();
    analysis.openHour = hour + ':00 UTC';
    analysis.isGoodHour = hour >= 8 && hour <= 16;

    return analysis;
  }

  /**
   * Review last N trades and find patterns
   */
  findPatterns(count = 20) {
    const trades = this.#db.prepare(
      "SELECT * FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT ?"
    ).all(count);

    if (!trades.length) return null;

    const patterns = {
      // Best exit reason
      bestExit: this.#findBestExit(trades),
      // Best hour
      bestHour: this.#findBestHour(trades),
      // Best pair
      bestPair: this.#findBestPair(trades),
      // Average hold time for wins vs losses
      avgHoldWins: this.#avgHold(trades.filter(t => t.pnl > 0)),
      avgHoldLosses: this.#avgHold(trades.filter(t => t.pnl <= 0)),
      // Recommendations
      recommendations: [],
    };

    // Generate recommendations
    if (patterns.bestExit) {
      patterns.recommendations.push('Best exit reason: ' + patterns.bestExit);
    }
    if (patterns.bestHour) {
      patterns.recommendations.push('Best trading hour: ' + patterns.bestHour);
    }
    if (patterns.bestPair) {
      patterns.recommendations.push('Best pair: ' + patterns.bestPair);
    }
    if (patterns.avgHoldWins > 0 && patterns.avgHoldLosses > 0) {
      if (patterns.avgHoldLosses < patterns.avgHoldWins) {
        patterns.recommendations.push('Losses close faster than wins - good risk management');
      } else {
        patterns.recommendations.push('Losses held too long - consider tighter stops');
      }
    }

    return patterns;
  }

  #analyzeWin(trade) {
    const notes = [];
    if (trade.exit_reason === 'take_profit') notes.push('Hit full TP');
    if (trade.exit_reason === 'trailing_stop') notes.push('Trailing stop in profit');
    if (trade.roi > 2) notes.push('High ROI trade');
    if (trade.hold_duration < 3600000) notes.push('Quick win');
    return notes.join(', ') || 'Standard win';
  }

  #analyzeLoss(trade) {
    const notes = [];
    if (trade.exit_reason === 'stop_loss') notes.push('Hit SL');
    if (trade.exit_reason === 'trailing_stop') notes.push('Trailing stop in loss');
    if (trade.exit_reason === 'max_hold') notes.push('Held too long');
    if (trade.roi < -2) notes.push('Large loss');
    if (trade.hold_duration < 600000) notes.push('Quick loss');
    return notes.join(', ') || 'Standard loss';
  }

  #findBestExit(trades) {
    const byReason = {};
    for (const t of trades) {
      if (!byReason[t.exit_reason]) byReason[t.exit_reason] = { wins: 0, total: 0 };
      byReason[t.exit_reason].total++;
      if (t.pnl > 0) byReason[t.exit_reason].wins++;
    }
    let best = null, bestRate = 0;
    for (const [reason, data] of Object.entries(byReason)) {
      const rate = data.total > 0 ? data.wins / data.total : 0;
      if (rate > bestRate && data.total >= 3) { bestRate = rate; best = reason; }
    }
    return best;
  }

  #findBestHour(trades) {
    const byHour = {};
    for (const t of trades) {
      const hour = new Date(t.open_time).getUTCHours();
      if (!byHour[hour]) byHour[hour] = { pnl: 0, count: 0 };
      byHour[hour].pnl += t.pnl;
      byHour[hour].count++;
    }
    let bestHour = 0, bestPnl = -Infinity;
    for (const [h, d] of Object.entries(byHour)) {
      if (d.pnl > bestPnl && d.count >= 2) { bestPnl = d.pnl; bestHour = h; }
    }
    return bestHour + ':00 UTC';
  }

  #findBestPair(trades) {
    const byPair = {};
    for (const t of trades) {
      if (!byPair[t.pair]) byPair[t.pair] = { pnl: 0, wins: 0, total: 0 };
      byPair[t.pair].pnl += t.pnl;
      byPair[t.pair].total++;
      if (t.pnl > 0) byPair[t.pair].wins++;
    }
    let best = null, bestScore = -Infinity;
    for (const [pair, data] of Object.entries(byPair)) {
      const score = data.pnl + (data.wins / (data.total || 1)) * 50;
      if (score > bestScore && data.total >= 3) { bestScore = score; best = pair; }
    }
    return best;
  }

  #avgHold(trades) {
    if (!trades.length) return 0;
    return trades.reduce((s, t) => s + (t.hold_duration || 0), 0) / trades.length / 3600000;
  }
}
