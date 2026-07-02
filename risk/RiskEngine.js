import { PositionSizer } from './PositionSizer.js';
import { CircuitBreaker } from './CircuitBreaker.js';

export class RiskEngine {
  #config; #logger; #db; #breaker; #sizer;

  constructor(config, logger, db) {
    this.#config = config;
    this.#logger = logger;
    this.#db = db;
    this.#breaker = new CircuitBreaker(config, logger, db);
    this.#sizer = new PositionSizer(config);
  }

  async canTrade() {
    const b = await this.#breaker.check();
    if (!b.allowed) return b;
    const o = this.#db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get();
    if ((o?.c || 0) >= this.#config.risk.maxOpenPositions) {
      return { allowed: false, reason: 'Max positions' };
    }
    return { allowed: true };
  }

  calculatePositionSize(balance, entry, sl) {
    return this.#sizer.calculate(balance, entry, sl);
  }

  calculatePositionSizeWithKelly(balance, entry, sl) {
    const trades = this.#db.prepare(
      "SELECT pnl FROM positions WHERE status='closed' ORDER BY close_time DESC LIMIT 50"
    ).all();
    return this.#sizer.calculateWithKelly(balance, entry, sl, trades);
  }

  calculateLevels(entry, atr, side) {
    const risk = this.#config.risk;
    const ind = this.#config.indicators;

    const sl = side === 'long'
      ? entry - atr * ind.atrSlMultiplier
      : entry + atr * ind.atrSlMultiplier;
    const tp = side === 'long'
      ? entry + atr * ind.atrTpMultiplier
      : entry - atr * ind.atrTpMultiplier;
    const be = side === 'long'
      ? entry + atr * risk.breakEvenTrigger
      : entry - atr * risk.breakEvenTrigger;

    // Minimum 1:2 R:R
    const riskDist = Math.abs(entry - sl);
    const rewardDist = Math.abs(tp - entry);
    const rr = rewardDist / riskDist;

    let adjustedTp = tp;
    if (rr < 2.0) {
      adjustedTp = side === 'long' ? entry + riskDist * 2.0 : entry - riskDist * 2.0;
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
  get sizer() { return this.#sizer; }
}
