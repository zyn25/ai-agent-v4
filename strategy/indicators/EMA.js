import { ema } from 'technicalindicators';

export class EMAIndicator {
  static calculate(closes, period) {
    if (!closes || closes.length < period) return [];
    const result = ema({ period, values: closes });
    return Array.isArray(result) ? result : [];
  }

  static crossover(fast, slow) {
    if (!fast || !slow || fast.length < 2 || slow.length < 2) return 'neutral';
    const cd = fast[fast.length - 1] - slow[slow.length - 1];
    const pd = fast[fast.length - 2] - slow[slow.length - 2];
    if (isNaN(cd) || isNaN(pd)) return 'neutral';
    if (pd <= 0 && cd > 0) return 'bullish';
    if (pd >= 0 && cd < 0) return 'bearish';
    return cd > 0 ? 'above' : 'below';
  }
}
