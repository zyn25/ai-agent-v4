import { EMAIndicator } from './indicators/EMA.js';

/**
 * Market structure analyzer.
 * Finds support/resistance levels and determines trend.
 */
export class MarketStructure {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  analyze(highs, lows, closes) {
    if (!closes || closes.length < 50) {
      return { trend: 'unknown', strength: 0, support: null, resistance: null, nearSupport: false, nearResistance: false };
    }

    const current = closes[closes.length - 1];
    const support = this.#findSupport(lows, closes, current);
    const resistance = this.#findResistance(highs, closes, current);
    const structure = this.#analyzeStructure(highs, lows);

    const distToSupport = support ? ((current - support) / current * 100) : null;
    const distToResistance = resistance ? ((resistance - current) / current * 100) : null;

    // Near support = potential long entry
    const nearSupport = distToSupport !== null && distToSupport < 1.0;
    // Near resistance = potential short entry or take profit
    const nearResistance = distToResistance !== null && distToResistance < 1.0;

    return {
      trend: structure.trend,
      strength: structure.strength,
      support,
      resistance,
      distToSupport: distToSupport?.toFixed(2) + '%',
      distToResistance: distToResistance?.toFixed(2) + '%',
      nearSupport,
      nearResistance,
      swingHigh: structure.swingHigh,
      swingLow: structure.swingLow,
      structure: structure.pattern
    };
  }

  /**
   * Validate if entry is near a good S/R level
   * @returns {boolean} true if entry is favorable
   */
  validateEntry(side, price, highs, lows, closes) {
    const sr = this.analyze(highs, lows, closes);
    if (!sr.support || !sr.resistance) return true;

    if (side === 'long') {
      // Long near support = good
      if (sr.nearSupport) return true;
      // Long near resistance = bad
      if (sr.nearResistance) return false;
    } else {
      // Short near resistance = good
      if (sr.nearResistance) return true;
      // Short near support = bad
      if (sr.nearSupport) return false;
    }

    return true;
  }

  #findSupport(lows, closes, current) {
    const recent = lows.slice(-50);
    const levels = [];
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i] < recent[i-1] && recent[i] < recent[i-2] &&
          recent[i] < recent[i+1] && recent[i] < recent[i+2]) {
        if (recent[i] < current) levels.push(recent[i]);
      }
    }
    if (!levels.length) return null;
    return Math.max(...levels);
  }

  #findResistance(highs, closes, current) {
    const recent = highs.slice(-50);
    const levels = [];
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i] > recent[i-1] && recent[i] > recent[i-2] &&
          recent[i] > recent[i+1] && recent[i] > recent[i+2]) {
        if (recent[i] > current) levels.push(recent[i]);
      }
    }
    if (!levels.length) return null;
    return Math.min(...levels);
  }

  #analyzeStructure(highs, lows) {
    const recent20h = highs.slice(-20);
    const recent20l = lows.slice(-20);
    const recent50h = highs.slice(-50);
    const recent50l = lows.slice(-50);

    const swingHigh = Math.max(...recent20h);
    const swingLow = Math.min(...recent20l);
    const prevHigh = Math.max(...recent50h.slice(0, 30));
    const prevLow = Math.min(...recent50l.slice(0, 30));

    let trend = 'neutral';
    let strength = 50;
    let pattern = 'ranging';

    if (swingHigh > prevHigh && swingLow > prevLow) {
      trend = 'bullish'; strength = 80; pattern = 'higher_highs_higher_lows';
    } else if (swingHigh < prevHigh && swingLow < prevLow) {
      trend = 'bearish'; strength = 80; pattern = 'lower_highs_lower_lows';
    } else if (swingHigh > prevHigh && swingLow < prevLow) {
      trend = 'volatile'; strength = 40; pattern = 'expanding_range';
    } else if (swingHigh < prevHigh && swingLow > prevLow) {
      trend = 'squeeze'; strength = 60; pattern = 'contracting_range';
    }

    return { trend, strength, swingHigh, swingLow, pattern };
  }
}
