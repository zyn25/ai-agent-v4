export class PositionSizer {
  #config;
  constructor(config) { this.#config = config; }

  calculate(balance, entryPrice, stopLoss) {
    const riskPercent = this.#config.risk.riskPerTrade / 100;
    const riskAmount = balance * riskPercent;
    const stopDistance = Math.abs(entryPrice - stopLoss);

    if (stopDistance === 0) {
      return { quantity: 0, riskAmount: 0, leverage: this.#config.exchange.leverage };
    }

    const quantity = riskAmount / stopDistance;
    const positionValue = quantity * entryPrice;
    const leverage = this.#config.exchange.leverage;
    const marginRequired = positionValue / leverage;

    return {
      quantity: Math.floor(quantity * 10000) / 10000,
      riskAmount: Math.round(riskAmount * 100) / 100,
      riskPercent: this.#config.risk.riskPerTrade,
      positionValue: Math.round(positionValue * 100) / 100,
      marginRequired: Math.round(marginRequired * 100) / 100,
      leverage,
    };
  }

  calculateKelly(trades, balance) {
    if (!trades || trades.length < 10) {
      return { winRate: 'N/A', payoffRatio: 'N/A', kelly: 'N/A', kellyHalf: 'N/A', sizePercent: '0.50', confidence: 'low', reason: 'Need min 10 trades' };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    if (wins.length === 0 || losses.length === 0) {
      return { winRate: 'N/A', payoffRatio: 'N/A', kelly: 'N/A', kellyHalf: 'N/A', sizePercent: '0.50', confidence: 'low', reason: 'Need both wins and losses' };
    }

    const winRate = wins.length / trades.length;
    const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const lossRate = 1 - winRate;
    const kellyRaw = payoffRatio > 0 ? (payoffRatio * winRate - lossRate) / payoffRatio : 0;
    const kellyHalf = kellyRaw * 0.5;

    const betSize = Math.min(Math.max(kellyHalf, 0.005), 0.05);

    return {
      winRate: (winRate * 100).toFixed(1) + '%',
      payoffRatio: payoffRatio.toFixed(2),
      kelly: (kellyRaw * 100).toFixed(2) + '%',
      kellyHalf: (kellyHalf * 100).toFixed(2) + '%',
      sizePercent: (betSize * 100).toFixed(2),
      confidence: betSize >= 0.02 ? 'high' : betSize >= 0.01 ? 'medium' : 'low',
      reason: kellyRaw <= 0 ? 'Negative edge' : 'OK'
    };
  }
}
