import { EMAIndicator } from './indicators/EMA.js';

export class TrendStrength {
  #config; #logger;
  constructor(config, logger) { this.#config = config; this.#logger = logger; }

  analyze(closes) {
    if (!closes || closes.length < 200) {
      return { strength: 0, direction: 'unknown', tradeable: false };
    }

    const ema20 = EMAIndicator.calculate(closes, 20);
    const ema50 = EMAIndicator.calculate(closes, 50);
    const ema100 = EMAIndicator.calculate(closes, 100);
    const ema200 = EMAIndicator.calculate(closes, 200);

    if (!ema20.length || !ema50.length || !ema100.length || !ema200.length) {
      return { strength: 0, direction: 'unknown', tradeable: false };
    }

    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e100 = ema100[ema100.length - 1];
    const e200 = ema200[ema200.length - 1];
    const price = closes[closes.length - 1];

    let score = 0;

    // EMA alignment (0-40 points)
    if (e20 > e50 && e50 > e100) score += 40;
    else if (e20 < e50 && e50 < e100) score += 40;
    else if (e20 > e50 || e20 < e50) score += 15;

    // Price vs EMA (0-30 points)
    const dist = Math.abs((price - e50) / e50) * 100;
    if (dist > 2) score += 30;
    else if (dist > 1) score += 20;
    else score += 5;

    // EMA spread (0-30 points)
    const spread = Math.abs((e20 - e50) / e50) * 100;
    if (spread > 1) score += 30;
    else if (spread > 0.5) score += 20;
    else score += 5;

    const direction = e20 > e50 ? 'bullish' : e20 < e50 ? 'bearish' : 'neutral';

    // EMA200 trend bias: block long below EMA200, block short above EMA200
    const ema200Bias = price > e200 ? 'bullish' : 'bearish';

    // IMPROVED: Raise minimum from 50 to 65
    const tradeable = score >= 65;

    return { strength: score, direction, tradeable, emaSpread: spread.toFixed(2), ema200Bias, priceVsEma200: ((price - e200) / e200 * 100).toFixed(2) };
  }
}
