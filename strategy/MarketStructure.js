/**
 * Market structure analyzer.
 * Required by master prompt: "Market Structure" + "Support Resistance"
 */
export class MarketStructure {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Analyze market structure
   * @param {array} highs - High prices
   * @param {array} lows - Low prices
   * @param {array} closes - Close prices
   * @returns {object} - Market structure analysis
   */
  analyze(highs, lows, closes) {
    if (!closes || closes.length < 50) {
      return { trend: 'unknown', strength: 0, support: null, resistance: null };
    }

    const current = closes[closes.length - 1];

    // Find support levels
    const support = this.#findSupport(lows, closes, current);

    // Find resistance levels
    const resistance = this.#findResistance(highs, closes, current);

    // Market structure (higher highs, lower lows)
    const structure = this.#analyzeStructure(highs, lows);

    // Distance to support/resistance
    const distToSupport = support ? ((current - support) / current * 100) : null;
    const distToResistance = resistance ? ((resistance - current) / current * 100) : null;

    return {
      trend: structure.trend,
      strength: structure.strength,
      support,
      resistance,
      distToSupport: distToSupport?.toFixed(2) + '%',
      distToResistance: distToResistance?.toFixed(2) + '%',
      swingHigh: structure.swingHigh,
      swingLow: structure.swingLow,
      structure: structure.pattern
    };
  }

  #findSupport(lows, closes, current) {
    const recent = lows.slice(-50);
    const levels = [];

    // Find local lows
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i] < recent[i-1] && recent[i] < recent[i-2] &&
          recent[i] < recent[i+1] && recent[i] < recent[i+2]) {
        if (recent[i] < current) levels.push(recent[i]);
      }
    }

    if (!levels.length) return null;
    // Return strongest support (closest below current price)
    return Math.max(...levels);
  }

  #findResistance(highs, closes, current) {
    const recent = highs.slice(-50);
    const levels = [];

    // Find local highs
    for (let i = 2; i < recent.length - 2; i++) {
      if (recent[i] > recent[i-1] && recent[i] > recent[i-2] &&
          recent[i] > recent[i+1] && recent[i] > recent[i+2]) {
        if (recent[i] > current) levels.push(recent[i]);
      }
    }

    if (!levels.length) return null;
    // Return strongest resistance (closest above current price)
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

    // Higher highs + higher lows = uptrend
    if (swingHigh > prevHigh && swingLow > prevLow) {
      trend = 'bullish';
      strength = 80;
      pattern = 'higher_highs_higher_lows';
    }
    // Lower highs + lower lows = downtrend
    else if (swingHigh < prevHigh && swingLow < prevLow) {
      trend = 'bearish';
      strength = 80;
      pattern = 'lower_highs_lower_lows';
    }
    // Higher highs + lower lows = expanding (volatile)
    else if (swingHigh > prevHigh && swingLow < prevLow) {
      trend = 'volatile';
      strength = 40;
      pattern = 'expanding_range';
    }
    // Lower highs + higher lows = contracting (squeeze)
    else if (swingHigh < prevHigh && swingLow > prevLow) {
      trend = 'squeeze';
      strength = 60;
      pattern = 'contracting_range';
    }

    return { trend, strength, swingHigh, swingLow, pattern };
  }
}
