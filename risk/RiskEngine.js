import { PositionSizer } from './PositionSizer.js';
import { CircuitBreaker } from './CircuitBreaker.js';

export class RiskEngine {
  #config; #logger; #db; #breaker; #sizer;

  constructor(config, logger, db) {
    this.#config = config; this.#logger = logger; this.#db = db;
    this.#breaker = new CircuitBreaker(config, logger, db);
    this.#sizer = new PositionSizer(config);
  }

  async canTrade() {
    const b = await this.#breaker.check();
    if (!b.allowed) return b;
    const o = this.#db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get();
    if ((o?.c || 0) >= this.#config.risk.maxOpenPositions) return { allowed: false, reason: 'Max positions' };
    return { allowed: true };
  }

  calculatePositionSize(balance, entry, sl) {
    return this.#sizer.calculate(balance, entry, sl);
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

    // IMPROVED: Ensure minimum 1:2 risk/reward
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    const rr = reward / risk;

    let adjustedTp = tp;
    if (rr < 2.0) {
      // Force minimum 1:2 R:R
      adjustedTp = side === 'long'
        ? entry + risk * 2.0
        : entry - risk * 2.0;
      this.#logger.trade('TP adjusted for 1:2 R:R: ' + tp.toFixed(2) + ' → ' + adjustedTp.toFixed(2));
    }

    return { stopLoss: sl, takeProfit: adjustedTp, breakEven: be };
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

  shouldPartialTP(currentPrice, entryPrice, side, currentIndex) {
    const levels = this.#config.risk.partialTpLevels;
    const sizes = this.#config.risk.partialTpSizes;
    if (currentIndex >= levels.length) return null;
    const targetRR = levels[currentIndex];
    const distance = side === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
    const riskDistance = Math.abs(entryPrice - (side === 'long' ? entryPrice - distance : entryPrice + distance));
    const currentRR = riskDistance > 0 ? Math.abs(distance / entryPrice) * 100 : 0;
    if (currentRR >= targetRR) return { level: currentIndex, sizePercent: sizes[currentIndex], rr: currentRR };
    return null;
  }

  getPartialTpLevels() { return this.#config.risk.partialTpLevels; }
  getPartialTpSizes() { return this.#config.risk.partialTpSizes; }

  async recordLoss() { await this.#breaker.recordLoss(); }
  async resetDaily() { await this.#breaker.resetDaily(); }
  get circuitBreaker() { return this.#breaker; }
}
