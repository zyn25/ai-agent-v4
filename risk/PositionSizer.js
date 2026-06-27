export class PositionSizer {
  #config;
  constructor(config) { this.#config = config; }
  calculate(balance, entry, sl) {
    const risk = balance * (this.#config.risk.riskPerTrade / 100);
    const dist = Math.abs(entry - sl);
    if (dist === 0) return { quantity: 0, riskAmount: 0, leverage: this.#config.exchange.leverage };
    const qty = risk / dist;
    const lev = this.#config.exchange.leverage;
    return { quantity: Math.floor(qty * 10000) / 10000, riskAmount: Math.round(risk * 100) / 100, positionValue: Math.round(qty * entry * 100) / 100, leverage: lev, marginRequired: Math.round((qty * entry / lev) * 100) / 100 };
  }
}
