export class MomentumCheck {
  #logger;
  constructor(logger) { this.#logger = logger; }

  check(closes, side) {
    if (!closes || closes.length < 10) {
      return { valid: true, reason: 'Insufficient data', strength: 0 };
    }

    const current = closes[closes.length - 1];
    const prev5 = closes[closes.length - 6];
    const change5 = ((current - prev5) / prev5) * 100;

    // FIX: Only block extreme opposite momentum
    if (side === 'long' && change5 < -2.0) {
      return { valid: false, reason: 'Strong bearish momentum (' + change5.toFixed(2) + '%)', strength: 0 };
    }

    if (side === 'short' && change5 > 2.0) {
      return { valid: false, reason: 'Strong bullish momentum (' + change5.toFixed(2) + '%)', strength: 0 };
    }

    if (side === 'long' && change5 > 0.5) {
      return { valid: true, reason: 'Bullish momentum', strength: 2 };
    }
    if (side === 'short' && change5 < -0.5) {
      return { valid: true, reason: 'Bearish momentum', strength: 2 };
    }

    return { valid: true, reason: 'Neutral momentum', strength: 0 };
  }
}
