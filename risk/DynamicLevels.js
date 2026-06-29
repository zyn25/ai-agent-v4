import { ATRIndicator } from '../strategy/indicators/ATR.js';

/**
 * Dynamic TP/SL calculator.
 * Adjusts levels based on market conditions.
 * Volatile market = wider SL/TP, quiet market = tighter SL/TP
 */
export class DynamicLevels {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Calculate dynamic SL/TP based on market conditions
   * @param {number} entryPrice - Entry price
   * @param {string} side - 'long' or 'short'
   * @param {array} highs - Recent high prices
   * @param {array} lows - Recent low prices
   * @param {array} closes - Recent close prices
   * @param {object} trendStrength - Trend strength result
   * @returns {object} - Dynamic levels
   */
  calculate(entryPrice, side, highs, lows, closes, trendStrength) {
    const atr = ATRIndicator.calculate(highs, lows, closes, this.#config.indicators.atrPeriod);
    if (!atr || !atr.length) {
      return this.#fallbackLevels(entryPrice, side);
    }

    const currentATR = atr[atr.length - 1];
    const avgATR = atr.reduce((s, v) => s + v, 0) / atr.length;
    const volatilityRatio = currentATR / avgATR;

    // Dynamic multiplier based on volatility
    let slMultiplier = this.#config.indicators.atrSlMultiplier;
    let tpMultiplier = this.#config.indicators.atrTpMultiplier;

    if (volatilityRatio > 1.5) {
      // High volatility: widen SL, increase TP
      slMultiplier *= 1.3;
      tpMultiplier *= 1.5;
    } else if (volatilityRatio > 1.2) {
      // Above average: slightly wider
      slMultiplier *= 1.1;
      tpMultiplier *= 1.2;
    } else if (volatilityRatio < 0.7) {
      // Low volatility: tighten SL, reduce TP
      slMultiplier *= 0.8;
      tpMultiplier *= 0.8;
    }

    // Adjust based on trend strength
    if (trendStrength) {
      const grade = trendStrength.grade;
      if (grade === 'A+' || grade === 'A') {
        // Strong trend: let profits run
        tpMultiplier *= 1.3;
      } else if (grade === 'C' || grade === 'D') {
        // Weak trend: take profit earlier
        tpMultiplier *= 0.7;
        slMultiplier *= 0.8;
      }
    }

    // Find support/resistance from recent highs/lows
    const support = this.#findSupport(lows, entryPrice);
    const resistance = this.#findResistance(highs, entryPrice);

    // Calculate levels
    const atrSL = currentATR * slMultiplier;
    const atrTP = currentATR * tpMultiplier;

    let stopLoss, takeProfit, breakEven;

    if (side === 'long') {
      // SL: max of ATR-based or support-based
      const supportSL = support ? entryPrice - (entryPrice - support) * 0.9 : entryPrice - atrSL;
      stopLoss = Math.max(entryPrice - atrSL, supportSL);

      // TP: min of ATR-based or resistance-based
      const resistanceTP = resistance ? entryPrice + (resistance - entryPrice) * 0.8 : entryPrice + atrTP;
      takeProfit = Math.min(entryPrice + atrTP, resistanceTP);

      breakEven = entryPrice + currentATR * this.#config.risk.breakEvenTrigger;
    } else {
      const resistanceSL = resistance ? entryPrice + (resistance - entryPrice) * 0.9 : entryPrice + atrSL;
      stopLoss = Math.min(entryPrice + atrSL, resistanceSL);

      const supportTP = support ? entryPrice - (entryPrice - support) * 0.8 : entryPrice - atrTP;
      takeProfit = Math.max(entryPrice - atrTP, supportTP);

      breakEven = entryPrice - currentATR * this.#config.risk.breakEvenTrigger;
    }

    const riskReward = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);

    return {
      stopLoss,
      takeProfit,
      breakEven,
      atr: currentATR,
      atrPercent: (currentATR / entryPrice * 100).toFixed(2) + '%',
      volatilityRatio: volatilityRatio.toFixed(2),
      slMultiplier: slMultiplier.toFixed(2),
      tpMultiplier: tpMultiplier.toFixed(2),
      riskReward: riskReward.toFixed(2),
      support: support?.toFixed(2),
      resistance: resistance?.toFixed(2),
      mode: volatilityRatio > 1.5 ? 'volatile' : volatilityRatio < 0.7 ? 'quiet' : 'normal'
    };
  }

  #findSupport(lows, currentPrice) {
    const recent = lows.slice(-50);
    const belowPrice = recent.filter(l => l < currentPrice);
    if (!belowPrice.length) return null;
    return Math.max(...belowPrice);
  }

  #findResistance(highs, currentPrice) {
    const recent = highs.slice(-50);
    const abovePrice = recent.filter(h => h > currentPrice);
    if (!abovePrice.length) return null;
    return Math.min(...abovePrice);
  }

  #fallbackLevels(entryPrice, side) {
    const sl = entryPrice * 0.02;
    const tp = entryPrice * 0.04;
    return {
      stopLoss: side === 'long' ? entryPrice - sl : entryPrice + sl,
      takeProfit: side === 'long' ? entryPrice + tp : entryPrice - tp,
      breakEven: side === 'long' ? entryPrice + sl * 0.5 : entryPrice - sl * 0.5,
      mode: 'fallback'
    };
  }
}
