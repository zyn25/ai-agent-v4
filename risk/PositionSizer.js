import { KellyCriterion } from './KellyCriterion.js';

export class PositionSizer {
  #config; #kelly;
  constructor(config) {
    this.#config = config;
    this.#kelly = new KellyCriterion(config);
  }

  calculate(balance, entryPrice, stopLoss) {
    const riskPercent = this.#config.risk.riskPerTrade / 100;
    const riskAmount = balance * riskPercent;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const stopPercent = stopDistance / entryPrice;

    if (stopPercent === 0) {
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
    return this.#kelly.getRecommendedSize(trades, balance);
  }

  calculateWithKelly(balance, entryPrice, stopLoss, trades) {
    const fixed = this.calculate(balance, entryPrice, stopLoss);
    const kelly = this.#kelly.getRecommendedSize(trades, balance);

    // Use Kelly if confidence is high, otherwise use fixed
    const useKelly = kelly.confidence === 'high' && parseFloat(kelly.sizePercent) > 0;

    if (useKelly) {
      const kellyRiskAmount = balance * (parseFloat(kelly.sizePercent) / 100);
      const stopDistance = Math.abs(entryPrice - stopLoss);
      const kellyQty = stopDistance > 0 ? kellyRiskAmount / stopDistance : 0;
      return {
        ...fixed,
        quantity: Math.floor(kellyQty * 10000) / 10000,
        riskAmount: Math.round(kellyRiskAmount * 100) / 100,
        riskPercent: parseFloat(kelly.sizePercent),
        marginRequired: Math.round((kellyQty * entryPrice / fixed.leverage) * 100) / 100,
        method: 'kelly',
        kelly: kelly
      };
    }

    return { ...fixed, method: 'fixed', kelly };
  }

  get kelly() { return this.#kelly; }
}
