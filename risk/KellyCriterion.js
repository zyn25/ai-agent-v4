/**
 * Kelly Criterion position sizing.
 * Calculates optimal bet size based on historical win rate and payoff ratio.
 * 
 * Formula: f* = (bp - q) / b
 * Where:
 *   b = average win / average loss (payoff ratio)
 *   p = probability of winning (win rate)
 *   q = 1 - p (probability of losing)
 * 
 * We use half-Kelly for safety (more conservative).
 */
export class KellyCriterion {
  #minBet = 0.005;   // 0.5% minimum
  #maxBet = 0.05;    // 5% maximum
  #kellyFraction = 0.5; // Half-Kelly for safety

  constructor(config) {
    if (config?.risk?.riskPerTrade) {
      this.#maxBet = config.risk.riskPerTrade / 100;
    }
  }

  /**
   * Calculate Kelly bet size
   * @param {number} winRate - Win rate as decimal (0.4 = 40%)
   * @param {number} avgWin - Average winning trade amount
   * @param {number} avgLoss - Average losing trade amount
   * @returns {object} Kelly sizing result
   */
  calculate(winRate, avgWin, avgLoss) {
    if (!winRate || !avgWin || !avgLoss || avgLoss === 0) {
      return { kelly: 0, betSize: this.#minBet, reason: 'Insufficient data' };
    }

    const payoffRatio = avgWin / avgLoss;
    const lossRate = 1 - winRate;

    // Kelly formula
    const kellyRaw = (payoffRatio * winRate - lossRate) / payoffRatio;

    // Apply half-Kelly
    const kellyHalf = kellyRaw * this.#kellyFraction;

    // Clamp between min and max
    const betSize = Math.min(Math.max(kellyHalf, this.#minBet), this.#maxBet);

    // Negative Kelly means don't bet
    if (kellyRaw <= 0) {
      return {
        kelly: kellyRaw,
        kellyHalf: kellyHalf,
        betSize: 0,
        payoffRatio: payoffRatio.toFixed(2),
        reason: 'Negative edge - do not trade'
      };
    }

    return {
      kelly: kellyRaw,
      kellyHalf: kellyHalf,
      betSize: betSize,
      payoffRatio: payoffRatio.toFixed(2),
      reason: kellyHalf < 0.01 ? 'Low confidence' : 'Normal'
    };
  }

  /**
   * Get position size based on Kelly from trade history
   * @param {Array} trades - Array of trade objects with pnl
   * @param {number} balance - Current balance
   * @returns {object} Recommended sizing
   */
  getRecommendedSize(trades, balance) {
    if (!trades || trades.length < 10) {
      return {
        sizePercent: this.#minBet * 100,
        sizeAmount: balance * this.#minBet,
        confidence: 'low',
        reason: 'Need min 10 trades (have ' + (trades ? trades.length : 0) + ')'
      };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    if (wins.length === 0 || losses.length === 0) {
      return {
        sizePercent: this.#minBet * 100,
        sizeAmount: balance * this.#minBet,
        confidence: 'low',
        reason: 'Need both wins and losses'
      };
    }

    const winRate = wins.length / trades.length;
    const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);

    const result = this.calculate(winRate, avgWin, avgLoss);

    return {
      sizePercent: (result.betSize * 100).toFixed(2),
      sizeAmount: (balance * result.betSize).toFixed(2),
      kelly: (result.kelly * 100).toFixed(2) + '%',
      kellyHalf: (result.kellyHalf * 100).toFixed(2) + '%',
      winRate: (winRate * 100).toFixed(1) + '%',
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      payoffRatio: result.payoffRatio,
      confidence: result.betSize >= 0.02 ? 'high' : result.betSize >= 0.01 ? 'medium' : 'low',
      reason: result.reason
    };
  }
}
