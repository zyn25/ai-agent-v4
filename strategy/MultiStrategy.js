/**
 * Multi-strategy mode.
 * Runs multiple strategies simultaneously.
 * Each strategy has different parameters.
 */
export class MultiStrategy {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  /**
   * Get strategy variants for a signal
   * @returns {Array} Different strategy interpretations
   */
  getVariants(signal) {
    const variants = [];

    // Variant 1: Momentum (aggressive)
    variants.push({
      name: 'momentum',
      side: signal.side,
      confidence: signal.confidence,
      slMultiplier: 1.5,
      tpMultiplier: 3.0,
      description: 'Tight SL, medium TP'
    });

    // Variant 2: Trend Following (balanced)
    variants.push({
      name: 'trend_following',
      side: signal.side,
      confidence: signal.confidence,
      slMultiplier: 2.0,
      tpMultiplier: 4.0,
      description: 'Standard SL/TP'
    });

    // Variant 3: Conservative (wide SL)
    variants.push({
      name: 'conservative',
      side: signal.side,
      confidence: signal.confidence,
      slMultiplier: 3.0,
      tpMultiplier: 5.0,
      description: 'Wide SL, big TP'
    });

    // Variant 4: Counter-trend (if signal is weak)
    if (signal.confidence < 40) {
      const counterSide = signal.side === 'long' ? 'short' : 'long';
      variants.push({
        name: 'counter_trend',
        side: counterSide,
        confidence: 100 - signal.confidence,
        slMultiplier: 1.5,
        tpMultiplier: 2.0,
        description: 'Counter-trend quick trade'
      });
    }

    return variants;
  }

  /**
   * Select best variant based on market conditions
   */
  selectBest(variants, volatility) {
    // High volatility → conservative
    if (volatility > 2.0) {
      return variants.find(v => v.name === 'conservative') || variants[0];
    }

    // Low volatility → momentum
    if (volatility < 0.5) {
      return variants.find(v => v.name === 'momentum') || variants[0];
    }

    // Normal → trend following
    return variants.find(v => v.name === 'trend_following') || variants[0];
  }
}
