import { PositionSizer } from './PositionSizer.js';
import { CircuitBreaker } from './CircuitBreaker.js';

export class RiskEngine {
  #config; #logger; #database; #breaker; #sizer;

  constructor(config, logger, db) {
    this.#config = config; this.#logger = logger; this.#database = db;
    this.#breaker = new CircuitBreaker(config, logger, db);
    this.#sizer = new PositionSizer(config);
  }

  async canTrade() {
    const b = await this.#breaker.check();
    if (!b.allowed) return b;
    const open = this.#database.db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get().c;
    if (open >= this.#config.risk.maxOpenPositions) return { allowed: false, reason: 'Max positions reached' };
    return { allowed: true };
  }

  calculatePositionSize(bal, entry, sl) {
    return this.#sizer.calculate(bal, entry, sl);
  }

  calculateLevels(entry, atr, side) {
    const sl = side === 'long'
      ? entry - atr * this.#config.indicators.atrSlMultiplier
      : entry + atr * this.#config.indicators.atrSlMultiplier;
    const tp = side === 'long'
      ? entry + atr * this.#config.indicators.atrTpMultiplier
      : entry - atr * this.#config.indicators.atrTpMultiplier;
    const be = side === 'long'
      ? entry + atr * this.#config.risk.breakEvenTrigger
      : entry - atr * this.#config.risk.breakEvenTrigger;
    return { stopLoss: sl, takeProfit: tp, breakEven: be };
  }

  shouldBreakEven(cur, entry, be, side) {
    if (!be || !cur || !entry) return false;
    return side === 'long' ? cur >= be : cur <= be;
  }

  getTrailingStop(cur, atr, side) {
    if (!cur || !atr) return null;
    const d = atr * this.#config.risk.trailingStopATR;
    return side === 'long' ? cur - d : cur + d;
  }

  // FIX: Actually call breaker.recordLoss()
  async recordLoss() {
    await this.#breaker.recordLoss();
  }

  async resetDaily() {
    await this.#breaker.resetDaily();
  }

  get circuitBreaker() { return this.#breaker; }
}
