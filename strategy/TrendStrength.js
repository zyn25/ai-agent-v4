import { EMAIndicator } from './indicators/EMA.js';

/**
 * Trend strength analyzer.
 * IMPROVED: Higher threshold for stronger trends.
 */
export class TrendStrength {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  analyze(closes) {
    if (!closes || closes.length < 100) {
      return { strength: 0, direction: 'unknown', tradeable: false };
    }

    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    const ema100 = EMAIndicator.calculate(closes, 100);

    if (!ema20.length || !ema50.length || !ema100.length) {
      return { strength: 0, direction: 'unknown', tradeable: false };
    }

    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e100 = ema100[ema100.length - 1];
    const price = closes[closes.length - 1];

    let score = 0;

    // EMA alignment (0-40 points)
    if (e20 > e50 && e50 > e100) score += 40;
    else if (e20 < e50 && e50 < e100) score += 40;
    else if (e20 > e50 || e20 < e50) score += 20;

    // Price vs EMA (0-30 points)
    const distFromEma50 = Math.abs((price - e50) / e50) * 100;
    if (distFromEma50 > 2) score += 30;
    else if (distFromEma50 > 1) score += 20;
    else score += 5;

    // EMA spread (0-30 points)
    const emaSpread = Math.abs((e20 - e50) / e50) * 100;
    if (emaSpread > 1) score += 30;
    else if (emaSpread > 0.5) score += 20;
    else score += 5;

    const direction = e20 > e50 ? 'bullish' : e20 < e50 ? 'bearish' : 'neutral';
    // IMPROVED: Higher threshold (60 instead of 50)
    const tradeable = score >= 60;

    return { strength: score, direction, tradeable, emaSpread: emaSpread.toFixed(2) };
  }
}
